import type { Command } from "commander";
import { readConfig } from "../config/store";
import { OllamaProvider, assertOllamaReady } from "../providers/ollama";
import { logger } from "../utils/logger";
import { assertPrompt, splitFamilyAndPrompt } from "../utils/validation";
import { readStdinIfPiped } from "../utils/stdin";
import { withInfrctlSystemPrompt } from "../chat/systemPrompt";
import { ensureFamilyInstalled } from "../models/ensureInstalled";
import {
  isModelFamilyId,
  parseModelFamily,
  type ModelFamilyId
} from "../registry/families";
import {
  appendMessagesToSession,
  createChatSession,
  loadChatSession,
  loadLatestChatSession,
  saveChatSession,
  type ChatSession
} from "../chat/sessions";
import { createChatTranscript, openChatTranscript } from "../chat/transcript";

export type AskOptions = {
  json?: boolean;
  yes?: boolean;
  model?: string;
  continue?: boolean;
  resume?: string;
  forkSession?: boolean;
  outputFormat?: string;
};

export function registerAskCommand(program: Command): void {
  program
    .command("ask")
    .description("Run a one-shot prompt with a local model")
    .argument("[args...]", "optional family followed by prompt")
    .option("--json", "print machine-readable JSON")
    .option("-y, --yes", "pull the selected model without prompting if it is missing")
    .option("-m, --model <family>", "model family to use")
    .option("-c, --continue", "resume the latest chat session")
    .option("-r, --resume <sessionId>", "resume a chat session by id or id prefix")
    .option("--fork-session", "resume context into a new session id")
    .option("--output-format <format>", "text or json")
    .action(async (args: string[], options: AskOptions) => {
      await runAsk(args, options);
    });
}

async function resolveAskSession(options: {
  family: ModelFamilyId;
  backendModel: string;
  resume?: string;
  continue?: boolean;
  forkSession?: boolean;
}): Promise<ChatSession | null> {
  if (options.resume || options.continue) {
    const loaded = options.resume
      ? await loadChatSession(options.resume)
      : await loadLatestChatSession();

    if (!options.forkSession) {
      return loaded;
    }

    return createChatSession({
      family: loaded.family,
      backendModel: loaded.backendModel,
      messages: [...loaded.messages]
    });
  }

  return null;
}

export async function runAsk(
  args: string[],
  options: AskOptions
): Promise<void> {
  const config = await readConfig();
  const parsed = splitFamilyAndPrompt(args, config.defaultFamily);
  const hasExplicitFamily =
    Boolean(options.model) || (args.length > 0 && isModelFamilyId(args[0]!));
  const stdin = await readStdinIfPiped();
  const prompt = [parsed.prompt.trim(), stdin].filter(Boolean).join("\n\n");
  assertPrompt(prompt);

  const provider = new OllamaProvider();
  await assertOllamaReady(provider);
  let family = options.model ? parseModelFamily(options.model) : parsed.family;
  const session = await resolveAskSession({
    family,
    backendModel: config.families[family].selectedTag,
    resume: options.resume,
    continue: options.continue,
    forkSession: options.forkSession
  });

  if (session && !hasExplicitFamily) {
    family = session.family;
  }

  await ensureFamilyInstalled(config, provider, family, {
    yes: options.yes
  });

  const backendModel = config.families[family].selectedTag;
  if (session) {
    session.family = family;
    session.backendModel = backendModel;
    if (!session.transcriptPath && config.chat.autoSave) {
      const transcript = await createChatTranscript(family, backendModel);
      session.transcriptPath = transcript.path;
    }
  }

  const response = await provider.chat({
    model: backendModel,
    messages: withInfrctlSystemPrompt([
      ...(session?.messages ?? []),
      { role: "user", content: prompt }
    ]),
    temperature: config.defaultTemperature,
    stream: false
  });

  if (session) {
    appendMessagesToSession(session, [
      { role: "user", content: prompt },
      { role: "assistant", content: response }
    ]);
    await saveChatSession(session);

    if (session.transcriptPath) {
      const transcript = openChatTranscript(session.transcriptPath);
      await transcript.appendMessage({ role: "user", content: prompt });
      await transcript.appendMessage({ role: "assistant", content: response });
    }
  }

  const jsonOutput = options.json || options.outputFormat === "json";

  if (jsonOutput) {
    logger.json({
      model: family,
      backendModel,
      sessionId: session?.id,
      response
    });
    return;
  }

  logger.info(response);
}
