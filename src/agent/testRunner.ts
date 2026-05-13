import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalHandler, ShellPolicy } from "./types";
import { runSmithCommand, type CommandResult } from "./shell";

export type TestPlan = {
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  scripts: Record<string, string>;
  commands: Array<{ command: string; args: string[] }>;
};

async function fileExists(cwd: string, fileName: string): Promise<boolean> {
  try {
    await readFile(path.join(cwd, fileName));
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(
  cwd: string
): Promise<TestPlan["packageManager"]> {
  if (await fileExists(cwd, "pnpm-lock.yaml")) return "pnpm";
  if (await fileExists(cwd, "yarn.lock")) return "yarn";
  if (await fileExists(cwd, "bun.lockb")) return "bun";
  if (await fileExists(cwd, "bun.lock")) return "bun";
  return "npm";
}

export async function readPackageScripts(
  cwd: string
): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(cwd, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

function scriptCommand(
  packageManager: TestPlan["packageManager"],
  script: string
): { command: string; args: string[] } {
  if (packageManager === "npm") {
    return script === "test"
      ? { command: "npm", args: ["test"] }
      : { command: "npm", args: ["run", script] };
  }

  return { command: packageManager, args: [script] };
}

export async function createTestPlan(
  cwd: string,
  scope: "small" | "full"
): Promise<TestPlan> {
  const packageManager = await detectPackageManager(cwd);
  const scripts = await readPackageScripts(cwd);
  const preferred =
    scope === "small"
      ? ["test", "lint", "build", "check", "typecheck"]
      : ["test", "lint", "typecheck", "build", "check"];
  const selected =
    scope === "small"
      ? preferred.find((script) => scripts[script])
        ? [preferred.find((script) => scripts[script])!]
        : []
      : preferred.filter((script) => scripts[script]);

  return {
    packageManager,
    scripts,
    commands: selected.map((script) => scriptCommand(packageManager, script))
  };
}

export async function runSmithTests(input: {
  cwd: string;
  scope: "small" | "full";
  policy: ShellPolicy;
  approve?: ApprovalHandler;
  dryRun?: boolean;
}): Promise<{
  ran: boolean;
  commands: string[];
  exitCode: number | null;
  output: string;
}> {
  const plan = await createTestPlan(input.cwd, input.scope);
  const commandLabels = plan.commands.map((command) =>
    [command.command, ...command.args].join(" ")
  );

  if (input.dryRun) {
    return {
      ran: false,
      commands: commandLabels,
      exitCode: null,
      output: `Dry run. Smith would run:\n${commandLabels.join("\n") || "No test scripts detected."}`
    };
  }

  if (plan.commands.length === 0) {
    return {
      ran: false,
      commands: [],
      exitCode: null,
      output: "No package test, lint, build, typecheck, or check scripts detected."
    };
  }

  const outputs: string[] = [];
  let finalExitCode: number | null = 0;

  for (const command of plan.commands) {
    const result: CommandResult = await runSmithCommand({
      cwd: input.cwd,
      request: command,
      policy: input.policy,
      approve: input.approve
    });
    outputs.push(`$ ${[command.command, ...command.args].join(" ")}\n${result.output}`);
    finalExitCode = result.exitCode;

    if (!result.ran || result.exitCode !== 0) {
      return {
        ran: result.ran,
        commands: commandLabels,
        exitCode: result.exitCode,
        output: outputs.join("\n\n")
      };
    }
  }

  return {
    ran: true,
    commands: commandLabels,
    exitCode: finalExitCode,
    output: outputs.join("\n\n")
  };
}
