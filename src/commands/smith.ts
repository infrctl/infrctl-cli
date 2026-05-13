import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { getGitDiff } from "../agent/git";
import { applyUnifiedPatch, undoLatestPatch } from "../agent/patch";
import { refreshRepoMemory } from "../agent/memory";
import {
  runSmithAgent,
  type SmithPatchResult,
  type SmithRunResult
} from "../agent/runner";
import { runSmithCommand } from "../agent/shell";
import { runSmithTests } from "../agent/testRunner";
import {
  approvalModeSchema,
  permissionProfileSchema,
  shellPolicySchema,
  type ApprovalHandler,
  type ApprovalMode,
  type PermissionProfile,
  type ShellPolicy,
  type SmithEvent
} from "../agent/types";
import { scanWorkspace } from "../agent/workspace";
import { readConfig } from "../config/store";
import { ensureFamilyInstalled } from "../models/ensureInstalled";
import { OllamaProvider, assertOllamaReady } from "../providers/ollama";
import { parseModelFamily, type ModelFamilyId } from "../registry/families";
import { ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";

type Config = Awaited<ReturnType<typeof readConfig>>;

export type SmithOptions = {
  model?: string;
  cwd?: string;
  approval?: string;
  shell?: string;
  profile?: string;
  dryRun?: boolean;
  json?: boolean;
  undo?: boolean;
  yes?: boolean;
};

type ResolvedSmithModes = {
  profile: PermissionProfile;
  approvalMode: ApprovalMode;
  shellPolicy: ShellPolicy;
  readOnly: boolean;
};

function parseApprovalMode(value: string): ApprovalMode {
  const parsed = approvalModeSchema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationError("Unknown approval mode. Use ask, step, or auto-edit.");
  }

  return parsed.data;
}

function parseShellPolicy(value: string): ShellPolicy {
  const parsed = shellPolicySchema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationError("Unknown shell policy. Use ask, safe, or off.");
  }

  return parsed.data;
}

function parsePermissionProfile(value: string): PermissionProfile {
  const parsed = permissionProfileSchema.safeParse(value);

  if (!parsed.success) {
    throw new ValidationError("Unknown profile. Use safe, normal, fast, or danger.");
  }

  return parsed.data;
}

export function resolveModes(config: Config, options: SmithOptions): ResolvedSmithModes {
  const profile = parsePermissionProfile(options.profile ?? config.agent.profile);
  const profileDefaults: Record<PermissionProfile, ResolvedSmithModes> = {
    safe: {
      profile,
      approvalMode: "ask",
      shellPolicy: "off",
      readOnly: true
    },
    normal: {
      profile,
      approvalMode: config.agent.approvalMode,
      shellPolicy: config.agent.shellPolicy,
      readOnly: false
    },
    fast: {
      profile,
      approvalMode: "auto-edit",
      shellPolicy: "safe",
      readOnly: false
    },
    danger: {
      profile,
      approvalMode: "auto-edit",
      shellPolicy: "safe",
      readOnly: false
    }
  };
  const resolved = profileDefaults[profile];

  return {
    ...resolved,
    approvalMode: options.approval
      ? parseApprovalMode(options.approval)
      : resolved.approvalMode,
    shellPolicy: options.shell ? parseShellPolicy(options.shell) : resolved.shellPolicy
  };
}

export function mergeSmithOptions(
  localOptions: SmithOptions,
  parentOptions: { model?: string } = {}
): SmithOptions {
  return {
    ...localOptions,
    model: localOptions.model ?? parentOptions.model
  };
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function printSmithHelp(): void {
  logger.info(`Commands:
/help                 Show this help
/exit                 Quit Smith
/status               Show current Smith settings
/diff                 Show the latest pending Smith patch or current git diff
/apply                Apply the latest dry-run unified diff patch
/reject               Forget the latest pending patch
/undo                 Restore the latest Smith patch backup
/run <command>        Run a command through Smith's shell policy
/test [small|full]    Run detected package checks
/model <family>       Switch qwen, deepseek, llama, gemma, or phi
/compact              Refresh repo memory
/mode                 Show approval and shell policy

Examples:
add tests for config loading
refactor the status command output
find why the build is failing`);
}

function logSmithEvent(event: SmithEvent): void {
  if (event.type === "progress") {
    logger.info(event.message);
    return;
  }

  if (event.type === "plan") {
    logger.heading("Smith plan");
    event.steps.forEach((step, index) => logger.info(`${index + 1}. ${step}`));
    return;
  }

  if (event.type === "scan") {
    logger.info(`Smith scanned ${event.files} files in ${event.cwd}`);
    return;
  }

  if (event.type === "git") {
    logger.info(
      `Git ${event.phase}: ${
        event.isRepo
          ? event.changedFiles.length > 0
            ? `${event.changedFiles.length} changed files`
            : "clean"
          : "not a git repo"
      }`
    );
    return;
  }

  if (event.type === "memory") {
    logger.info(
      `Smith refreshed repo memory (${event.keyFiles.length} key files): ${event.path}`
    );
    return;
  }

  if (event.type === "compact") {
    logger.info(
      `Smith compacted context: ${event.beforeMessages} -> ${event.afterMessages} messages`
    );
    return;
  }

  if (event.type === "read") {
    logger.info(`Smith read ${event.path}`);
    return;
  }

  if (event.type === "search") {
    logger.info(`Smith searched "${event.query}" (${event.matches} matches)`);
    return;
  }

  if (event.type === "patch") {
    logger.info(
      event.applied
        ? `Smith applied patch: ${event.summary}`
        : event.dryRun
          ? `Smith captured patch: ${event.summary}`
          : `Smith skipped patch: ${event.summary}`
    );
    return;
  }

  if (event.type === "command") {
    logger.info(
      event.ran
        ? `Smith ran ${event.command} (exit ${event.exitCode})`
        : `Smith did not run ${event.command}`
    );
    return;
  }

  if (event.type === "test") {
    logger.info(
      event.ran
        ? `Smith ran ${event.scope} tests (exit ${event.exitCode})`
        : `Smith did not run ${event.scope} tests`
    );
    return;
  }

  if (event.type === "undo") {
    logger.info(`Smith restored ${event.backupId}: ${event.files.join(", ")}`);
  }
}

function createApprovalHandler(): ApprovalHandler {
  return async (request) => {
    if (!isInteractive()) {
      return false;
    }

    logger.info("");
    logger.heading(request.message);

    if (request.preview) {
      logger.info(request.preview);
    }

    return await confirm({
      message: "Approve?",
      default: request.type === "step"
    });
  };
}

function latestPendingPatch(result?: SmithRunResult): SmithPatchResult | undefined {
  return [...(result?.patches ?? [])]
    .reverse()
    .find((patch) => !patch.applied && Boolean(patch.patch));
}

function splitCommand(line: string): { command: string; args: string[] } {
  const [command, ...args] = line.trim().split(/\s+/).filter(Boolean);

  if (!command) {
    throw new ValidationError("No command provided.");
  }

  return { command, args };
}

async function undoLatest(cwd: string): Promise<void> {
  const backup = await undoLatestPatch(cwd);
  logSmithEvent({
    type: "undo",
    backupId: backup.id,
    files: backup.files.map((file) => file.path)
  });
}

async function executeSmithTask(
  inputTask: string,
  options: SmithOptions
): Promise<SmithRunResult> {
  const config = await readConfig();
  const family: ModelFamilyId = options.model
    ? parseModelFamily(options.model)
    : config.defaultFamily;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const modes = resolveModes(config, options);
  const provider = new OllamaProvider();

  await assertOllamaReady(provider);
  await ensureFamilyInstalled(config, provider, family, { yes: options.yes });

  const backendModel = config.families[family].selectedTag;
  const events: SmithEvent[] = [];

  if (!options.json) {
    logger.heading(`Smith using ${family}: ${backendModel}`);
    logger.info(`Workspace: ${cwd}`);
    logger.info(`Profile: ${modes.profile}`);
    logger.info(`Approval: ${modes.approvalMode}`);
    logger.info(`Shell: ${modes.shellPolicy}`);
    logger.info(`Dry run: ${options.dryRun ? "on" : "off"}`);
    logger.info("");
  }

  const result = await runSmithAgent({
    task: inputTask,
    cwd,
    family,
    backendModel,
    provider,
    approvalMode: modes.approvalMode,
    shellPolicy: modes.shellPolicy,
    temperature: 0.2,
    approve: createApprovalHandler(),
    onEvent: (event) => {
      events.push(event);

      if (!options.json) {
        logSmithEvent(event);
      }
    },
    maxSteps: config.agent.maxSteps,
    maxContextChars: config.agent.maxContextChars,
    readOnly: modes.readOnly,
    dryRun: options.dryRun
  });

  if (options.json) {
    logger.json({
      sessionId: result.sessionId,
      model: family,
      backendModel,
      profile: modes.profile,
      approval: modes.approvalMode,
      shell: modes.shellPolicy,
      dryRun: Boolean(options.dryRun),
      message: result.message,
      plan: result.plan,
      patches: result.patches,
      gitBefore: result.gitBefore,
      gitAfter: result.gitAfter,
      events
    });
    return result;
  }

  logger.info("");
  logger.info(result.message);
  logger.info("");
  logger.info(`Smith session: ${result.sessionId}`);

  return result;
}

async function runInteractiveSmith(options: SmithOptions): Promise<void> {
  let rl = createInterface({ input, output });
  let state: SmithOptions = { ...options };
  let lastResult: SmithRunResult | undefined;
  let pendingPatch: SmithPatchResult | undefined;
  logger.heading("Smith");
  logger.info("Local coding agent for infrctl. Type /help or /exit.");
  logger.info("");

  try {
    while (true) {
      const line = (await rl.question("smith > ")).trim();

      if (!line) {
        continue;
      }

      if (line === "/exit") {
        break;
      }

      if (line === "/help") {
        printSmithHelp();
        continue;
      }

      if (line === "/status" || line === "/mode") {
        const config = await readConfig();
        const modes = resolveModes(config, state);
        logger.info(`Model: ${state.model ?? config.defaultFamily}`);
        logger.info(`Workspace: ${path.resolve(state.cwd ?? process.cwd())}`);
        logger.info(`Profile: ${modes.profile}`);
        logger.info(`Approval: ${modes.approvalMode}`);
        logger.info(`Shell: ${modes.shellPolicy}`);
        logger.info(`Dry run: ${state.dryRun ? "on" : "off"}`);
        logger.info(`Last session: ${lastResult?.sessionId ?? "none"}`);
        continue;
      }

      if (line === "/diff") {
        if (pendingPatch) {
          logger.info(pendingPatch.preview);
        } else {
          logger.info(await getGitDiff(path.resolve(state.cwd ?? process.cwd())));
        }
        continue;
      }

      if (line === "/apply") {
        if (!pendingPatch?.patch) {
          logger.warn("No pending unified diff patch to apply.");
          continue;
        }

        const cwd = path.resolve(state.cwd ?? process.cwd());
        const result = await applyUnifiedPatch({
          root: cwd,
          summary: pendingPatch.summary,
          patch: pendingPatch.patch
        });
        logger.success(`Applied patch to: ${result.files.join(", ")}`);
        pendingPatch = undefined;
        continue;
      }

      if (line === "/reject") {
        pendingPatch = undefined;
        logger.success("Pending patch cleared.");
        continue;
      }

      if (line === "/undo") {
        await undoLatest(path.resolve(state.cwd ?? process.cwd()));
        continue;
      }

      if (line.startsWith("/run ")) {
        const config = await readConfig();
        const modes = resolveModes(config, state);
        const command = splitCommand(line.replace("/run ", ""));
        const result = await runSmithCommand({
          cwd: path.resolve(state.cwd ?? process.cwd()),
          request: command,
          policy: modes.shellPolicy,
          approve: createApprovalHandler()
        });
        logger.info(result.output);
        continue;
      }

      if (line.startsWith("/test")) {
        const config = await readConfig();
        const modes = resolveModes(config, state);
        const scope = line.includes("full") ? "full" : "small";
        const result = await runSmithTests({
          cwd: path.resolve(state.cwd ?? process.cwd()),
          scope,
          policy: modes.shellPolicy,
          approve: createApprovalHandler(),
          dryRun: state.dryRun
        });
        logger.info(result.output);
        continue;
      }

      if (line.startsWith("/model ")) {
        state = { ...state, model: parseModelFamily(line.replace("/model ", "").trim()) };
        logger.success(`Smith model set to ${state.model}`);
        continue;
      }

      if (line === "/compact") {
        const scan = await scanWorkspace(path.resolve(state.cwd ?? process.cwd()));
        const memory = await refreshRepoMemory(scan);
        logger.success(`Repo memory refreshed: ${memory.path}`);
        continue;
      }

      if (line.startsWith("/")) {
        logger.warn("Unknown Smith command. Type /help for commands.");
        continue;
      }

      rl.close();
      lastResult = await executeSmithTask(line, state);
      pendingPatch = latestPendingPatch(lastResult);
      rl = createInterface({ input, output });
    }
  } finally {
    rl.close();
  }
}

export function registerSmithCommand(program: Command): void {
  program
    .command("smith")
    .description("Run Smith, the local repo-editing coding agent")
    .argument("[task...]", "coding task for Smith")
    .option("-m, --model <family>", "model family to use")
    .option("--cwd <path>", "workspace directory", process.cwd())
    .option("--profile <profile>", "safe, normal, fast, or danger")
    .option("--approval <mode>", "ask, step, or auto-edit")
    .option("--shell <policy>", "ask, safe, or off")
    .option("--dry-run", "plan and capture patches without editing files or running commands")
    .option("--json", "print machine-readable JSON for one-shot tasks")
    .option("--undo", "restore the latest Smith patch backup for the workspace")
    .option("-y, --yes", "pull the selected model without prompting if it is missing")
    .action(
      async (
        taskParts: string[],
        localOptions: SmithOptions,
        command: Command
      ) => {
        const parentOptions = command.parent?.opts<{ model?: string }>() ?? {};
        const options = mergeSmithOptions(localOptions, parentOptions);
        const cwd = path.resolve(options.cwd ?? process.cwd());

        if (options.undo) {
          await undoLatest(cwd);
          return;
        }

        const task = taskParts.join(" ").trim();

        if (!task) {
          await runInteractiveSmith(options);
          return;
        }

        await executeSmithTask(task, options);
      }
    );
}
