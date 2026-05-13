import { execa } from "execa";
import type { ApprovalHandler, ShellPolicy } from "./types";
import { InfrctlError } from "../utils/errors";

export type CommandRequest = {
  command: string;
  args: string[];
};

export type CommandResult = {
  ran: boolean;
  exitCode: number | null;
  output: string;
};

const READ_ONLY_GIT = new Set(["diff", "status", "show", "log"]);
const SAFE_NPM_SCRIPTS = new Set([
  "build",
  "check",
  "lint",
  "test",
  "typecheck"
]);
const SAFE_DIRECT_COMMANDS = new Set(["cat", "ls", "pwd", "rg"]);
const BLOCKED_COMMANDS = new Set([
  "chmod",
  "chown",
  "curl",
  "docker",
  "bash",
  "fish",
  "git-reset",
  "kubectl",
  "mv",
  "npm-publish",
  "pnpm-publish",
  "rm",
  "rmdir",
  "rsync",
  "scp",
  "sh",
  "ssh",
  "sudo",
  "su",
  "wget",
  "zsh"
]);

function commandLabel(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

export function isDangerousCommand(command: string, args: string[]): boolean {
  const base = command.trim();
  const joined = commandLabel(base, args).toLowerCase();

  if (BLOCKED_COMMANDS.has(base)) {
    return true;
  }

  if (base === "git" && ["reset", "checkout", "clean"].includes(args[0] ?? "")) {
    return true;
  }

  if (
    ["npm", "pnpm", "yarn", "bun"].includes(base) &&
    args.some((arg) => arg === "publish")
  ) {
    return true;
  }

  return /\b(deploy|private[_-]?key|seed phrase|mnemonic)\b/i.test(joined);
}

export function isSafeCommand(command: string, args: string[]): boolean {
  if (isDangerousCommand(command, args)) {
    return false;
  }

  if (SAFE_DIRECT_COMMANDS.has(command)) {
    return true;
  }

  if (command === "git") {
    return READ_ONLY_GIT.has(args[0] ?? "");
  }

  if (command === "npm") {
    if (args[0] === "test") {
      return true;
    }

    return args[0] === "run" && SAFE_NPM_SCRIPTS.has(args[1] ?? "");
  }

  if (command === "pnpm" || command === "yarn" || command === "bun") {
    return SAFE_NPM_SCRIPTS.has(args[0] ?? "");
  }

  return false;
}

export async function runSmithCommand(input: {
  cwd: string;
  request: CommandRequest;
  policy: ShellPolicy;
  approve?: ApprovalHandler;
}): Promise<CommandResult> {
  const { command, args } = input.request;
  const label = commandLabel(command, args);

  if (input.policy === "off") {
    return {
      ran: false,
      exitCode: null,
      output: `Shell is disabled. Smith did not run: ${label}`
    };
  }

  if (isDangerousCommand(command, args)) {
    throw new InfrctlError(`Smith blocked an unsafe command: ${label}`);
  }

  const safe = isSafeCommand(command, args);

  if (input.policy === "ask" || (input.policy === "safe" && !safe)) {
    const approved =
      input.approve &&
      (await input.approve({
        type: "command",
        message: `Run command: ${label}?`,
        preview: label
      }));

    if (!approved) {
      return {
        ran: false,
        exitCode: null,
        output: `Command was not approved: ${label}`
      };
    }
  }

  const result = await execa(command, args, {
    cwd: input.cwd,
    all: true,
    reject: false,
    timeout: 120_000
  });
  const output = result.all || result.stdout || result.stderr || "";

  return {
    ran: true,
    exitCode: result.exitCode,
    output: output.slice(0, 20_000)
  };
}
