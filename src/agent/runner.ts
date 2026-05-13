import type { ChatMessage, OllamaProviderLike } from "../providers/ollama";
import type { ModelFamilyId } from "../registry/families";
import { withInfrctlSystemPrompt } from "../chat/systemPrompt";
import { InfrctlError, ValidationError } from "../utils/errors";
import { parseSmithAction, type SmithAction } from "./actions";
import { changedFilesForPatch, getGitStatus, type GitStatus } from "./git";
import { refreshRepoMemory } from "./memory";
import {
  applyPatchEdits,
  applyUnifiedPatch,
  createPatchPreview,
  validatePatchEdits,
  validateUnifiedPatch
} from "./patch";
import { createSmithSession, recordSmithEvent, saveSmithSession } from "./sessions";
import { runSmithCommand } from "./shell";
import { runSmithTests } from "./testRunner";
import {
  readWorkspaceFile,
  scanWorkspace,
  searchWorkspace
} from "./workspace";
import type {
  ApprovalHandler,
  ApprovalMode,
  ShellPolicy,
  SmithEvent,
  SmithEventHandler
} from "./types";

export type SmithPatchResult = {
  summary: string;
  files: string[];
  preview: string;
  patch?: string;
  applied: boolean;
  backupId?: string;
  dryRun?: boolean;
};

export type SmithRunOptions = {
  task: string;
  cwd: string;
  family: ModelFamilyId;
  backendModel: string;
  provider: Pick<OllamaProviderLike, "chat">;
  approvalMode: ApprovalMode;
  shellPolicy: ShellPolicy;
  temperature?: number;
  approve?: ApprovalHandler;
  onEvent?: SmithEventHandler;
  maxSteps?: number;
  maxContextChars?: number;
  readOnly?: boolean;
  dryRun?: boolean;
};

export type SmithRunResult = {
  sessionId: string;
  message: string;
  plan: string[];
  events: SmithEvent[];
  patches: SmithPatchResult[];
  gitBefore: GitStatus;
  gitAfter: GitStatus;
};

const SMITH_SYSTEM_PROMPT = `You are Smith, the local coding agent inside infrctl.
You help users edit the repository on their machine.

Rules:
- Stay local-first. Never claim to call cloud APIs.
- Refer to the product as "infrctl" exactly.
- Use only one JSON object in every response. Do not write prose outside JSON.
- Choose one action at a time.
- Start with a short plan unless the task is only a direct question.
- If the task can be answered from the provided repo memory, respond directly.
- Prefer reading and searching before proposing edits.
- Propose unified diff patches with the "patch" field. Avoid whole-file rewrites.
- Do not propose destructive commands, deployment commands, publishing commands, or commands involving private keys.

Supported response shapes:
{"action":"plan","steps":["inspect relevant files","propose a patch","run tests"]}
{"action":"read_file","path":"relative/path.ts"}
{"action":"search","query":"text to search","glob":"optional-glob"}
{"action":"propose_patch","summary":"what changes","patch":"diff --git a/file.ts b/file.ts\\n--- a/file.ts\\n+++ b/file.ts\\n@@ ..."}
{"action":"run_command","command":"npm","args":["test"]}
{"action":"run_tests","scope":"small"}
{"action":"respond","message":"final user-facing answer"}`;

function workspaceSummary(files: Array<{ path: string; size: number }>): string {
  return files
    .slice(0, 180)
    .map((file) => `${file.path} (${file.size} bytes)`)
    .join("\n");
}

function toolMessage(label: string, content: string): ChatMessage {
  return {
    role: "user",
    content: `Tool result for ${label}:\n${content}`
  };
}

function compactAction(action: SmithAction): string {
  if (action.action === "propose_patch") {
    return JSON.stringify({
      action: action.action,
      summary: action.summary,
      files: action.patch ? "unified diff" : action.edits?.map((edit) => edit.path)
    });
  }

  return JSON.stringify(action);
}

async function maybeApproveStep(
  action: SmithAction,
  mode: ApprovalMode,
  approve?: ApprovalHandler
): Promise<boolean> {
  if (mode !== "step" || action.action === "respond") {
    return true;
  }

  if (!approve) {
    return false;
  }

  return await approve({
    type: "step",
    message: `Allow Smith action: ${action.action}?`,
    preview: compactAction(action)
  });
}

function totalMessageChars(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function compactMessages(messages: ChatMessage[], maxChars: number): boolean {
  if (totalMessageChars(messages) <= maxChars || messages.length <= 6) {
    return false;
  }

  const keep = messages.slice(-5);
  const older = messages.slice(0, -5);
  const summary = older
    .map((message) => `${message.role}: ${message.content.slice(0, 300)}`)
    .join("\n")
    .slice(0, Math.floor(maxChars / 3));

  messages.splice(0, messages.length, {
    role: "user",
    content: `Compacted earlier Smith context:\n${summary}`
  });
  messages.push(...keep);
  return true;
}

function patchApprovalPreview(input: {
  preview: string;
  dirtyFiles: string[];
  dryRun?: boolean;
}): string {
  const parts: string[] = [];

  if (input.dirtyFiles.length > 0) {
    parts.push(`Files already had git changes before Smith:\n${input.dirtyFiles.join("\n")}`);
  }

  if (input.dryRun) {
    parts.push("Dry run is on. Smith will not apply this patch.");
  }

  parts.push(input.preview);
  return parts.join("\n\n");
}

export async function runSmithAgent(
  options: SmithRunOptions
): Promise<SmithRunResult> {
  const task = options.task.trim();

  if (!task) {
    throw new ValidationError("Smith needs a task.");
  }

  const scan = await scanWorkspace(options.cwd);
  const gitBefore = await getGitStatus(scan.root);
  const memoryResult = await refreshRepoMemory(scan);
  const session = createSmithSession({
    task,
    cwd: scan.root,
    family: options.family,
    backendModel: options.backendModel,
    approvalMode: options.approvalMode,
    shellPolicy: options.shellPolicy
  });
  const events: SmithEvent[] = [];
  const patches: SmithPatchResult[] = [];
  const plan: string[] = [];
  const emit: SmithEventHandler = (event) => {
    events.push(event);
    recordSmithEvent(session, event);
    options.onEvent?.(event);
  };

  emit({ type: "scan", cwd: scan.root, files: scan.files.length });
  emit({
    type: "git",
    phase: "before",
    isRepo: gitBefore.isRepo,
    changedFiles: gitBefore.changedFiles
  });
  emit({
    type: "memory",
    path: memoryResult.path,
    keyFiles: memoryResult.memory.keyFiles
  });

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: `Task:
${task}

Workspace root:
${scan.root}

Git state before Smith:
${gitBefore.isRepo ? gitBefore.raw || "clean" : "not a git repository"}

Mode constraints:
- readOnly: ${Boolean(options.readOnly)}
- dryRun: ${Boolean(options.dryRun)}
- shellPolicy: ${options.shellPolicy}

Known files:
${workspaceSummary(scan.files)}

Repo memory:
${memoryResult.memory.summary.slice(0, 30_000)}`
    }
  ];

  let invalidResponses = 0;
  const maxSteps = options.maxSteps ?? 16;
  const maxContextChars = options.maxContextChars ?? 60_000;

  for (let step = 0; step < maxSteps; step += 1) {
    emit({ type: "progress", message: "Smith is thinking" });

    const rawResponse = await options.provider.chat({
      model: options.backendModel,
      messages: withInfrctlSystemPrompt(messages, SMITH_SYSTEM_PROMPT),
      temperature: options.temperature ?? 0.2,
      stream: false
    });
    let action: SmithAction;

    try {
      action = parseSmithAction(rawResponse);
      invalidResponses = 0;
    } catch (error) {
      invalidResponses += 1;
      messages.push({ role: "assistant", content: rawResponse });
      messages.push(
        toolMessage(
          "invalid_json",
          error instanceof Error
            ? `${error.message}\nRespond with exactly one supported JSON action.`
            : "Respond with exactly one supported JSON action."
        )
      );

      if (invalidResponses >= 2) {
        throw error;
      }

      continue;
    }

    messages.push({ role: "assistant", content: rawResponse });

    if (!(await maybeApproveStep(action, options.approvalMode, options.approve))) {
      messages.push(toolMessage(action.action, "The user did not approve this action."));
      continue;
    }

    if (action.action === "plan") {
      plan.splice(0, plan.length, ...action.steps);
      emit({ type: "plan", steps: action.steps });
      messages.push(toolMessage("plan", `Plan accepted:\n${action.steps.join("\n")}`));
      continue;
    }

    if (action.action === "respond") {
      const gitAfter = await getGitStatus(scan.root);
      emit({
        type: "git",
        phase: "after",
        isRepo: gitAfter.isRepo,
        changedFiles: gitAfter.changedFiles
      });
      emit({ type: "respond", message: action.message });
      session.finalMessage = action.message;
      await saveSmithSession(session);

      return {
        sessionId: session.id,
        message: action.message,
        plan,
        events,
        patches,
        gitBefore,
        gitAfter
      };
    }

    if (action.action === "read_file") {
      emit({ type: "progress", message: `Smith is reading ${action.path}` });
      const content = await readWorkspaceFile(scan.root, action.path);
      emit({ type: "read", path: action.path });
      messages.push(toolMessage(`read_file ${action.path}`, content));
      await saveSmithSession(session);
    }

    if (action.action === "search") {
      emit({ type: "progress", message: `Smith is searching for ${action.query}` });
      const result = await searchWorkspace(scan.root, action.query, action.glob);
      emit({
        type: "search",
        query: action.query,
        matches: result.matches
      });
      messages.push(toolMessage(`search ${action.query}`, result.output));
      await saveSmithSession(session);
    }

    if (action.action === "propose_patch") {
      emit({ type: "progress", message: "Smith is drafting a patch" });
      let files: string[];
      let preview: string;
      let applyResult:
        | Awaited<ReturnType<typeof applyUnifiedPatch>>
        | { files: string[]; backupId?: string; applied: boolean };

      if (action.patch) {
        files = await validateUnifiedPatch(scan.root, action.patch);
        preview = action.patch;
      } else {
        const edits = action.edits ?? [];
        await validatePatchEdits(scan.root, edits);
        files = edits.map((edit) => edit.path);
        preview = await createPatchPreview(scan.root, edits);
      }

      const dirtyFiles = changedFilesForPatch(gitBefore, files);
      const approved =
        !options.readOnly &&
        !options.dryRun &&
        (options.approvalMode === "auto-edit"
          ? dirtyFiles.length === 0 ||
            Boolean(
              options.approve &&
                (await options.approve({
                  type: "patch",
                  message: `Smith wants to edit files that already changed: ${dirtyFiles.join(", ")}`,
                  preview
                }))
            )
          : Boolean(
              options.approve &&
                (await options.approve({
                  type: "patch",
                  message: action.summary,
                  preview: patchApprovalPreview({
                    preview,
                    dirtyFiles,
                    dryRun: options.dryRun
                  })
                }))
            ));

      if (!approved) {
        const patchResult: SmithPatchResult = {
          summary: action.summary,
          files,
          preview,
          patch: action.patch,
          applied: false,
          dryRun: options.dryRun || options.readOnly
        };
        patches.push(patchResult);
        emit({
          type: "patch",
          summary: action.summary,
          applied: false,
          files,
          preview,
          dryRun: patchResult.dryRun
        });
        messages.push(
          toolMessage(
            "propose_patch",
            options.dryRun || options.readOnly
              ? "Patch was captured but not applied."
              : "Patch was not approved."
          )
        );
        await saveSmithSession(session);
      } else {
        if (action.patch) {
          applyResult = await applyUnifiedPatch({
            root: scan.root,
            summary: action.summary,
            patch: action.patch
          });
        } else {
          const appliedFiles = await applyPatchEdits(scan.root, action.edits ?? []);
          applyResult = { files: appliedFiles, applied: true };
        }

        const patchResult: SmithPatchResult = {
          summary: action.summary,
          files: applyResult.files,
          preview,
          patch: action.patch,
          applied: applyResult.applied,
          backupId: applyResult.backupId
        };
        patches.push(patchResult);
        emit({
          type: "patch",
          summary: action.summary,
          applied: true,
          files: applyResult.files,
          backupId: applyResult.backupId,
          preview
        });
        messages.push(
          toolMessage(
            "propose_patch",
            `Patch applied to:\n${applyResult.files.join("\n")}`
          )
        );
        await saveSmithSession(session);
      }
    }

    if (action.action === "run_command") {
      const result = await runSmithCommand({
        cwd: scan.root,
        request: {
          command: action.command,
          args: action.args
        },
        policy: options.dryRun || options.readOnly ? "off" : options.shellPolicy,
        approve: options.approve
      });
      emit({
        type: "command",
        command: [action.command, ...action.args].join(" "),
        exitCode: result.exitCode,
        ran: result.ran
      });
      messages.push(
        toolMessage(
          `run_command ${action.command}`,
          `ran: ${result.ran}\nexitCode: ${result.exitCode}\n${result.output}`
        )
      );
      await saveSmithSession(session);
    }

    if (action.action === "run_tests") {
      const result = await runSmithTests({
        cwd: scan.root,
        scope: action.scope,
        policy: options.dryRun || options.readOnly ? "off" : options.shellPolicy,
        approve: options.approve,
        dryRun: options.dryRun || options.readOnly
      });
      emit({
        type: "test",
        scope: action.scope,
        ran: result.ran,
        commands: result.commands,
        exitCode: result.exitCode
      });
      messages.push(
        toolMessage(
          `run_tests ${action.scope}`,
          `ran: ${result.ran}\nexitCode: ${result.exitCode}\n${result.output}`
        )
      );
      await saveSmithSession(session);
    }

    const before = messages.length;

    if (compactMessages(messages, maxContextChars)) {
      emit({ type: "compact", beforeMessages: before, afterMessages: messages.length });
    }
  }

  await saveSmithSession(session);
  throw new InfrctlError("Smith reached the V1 step limit before finishing.");
}
