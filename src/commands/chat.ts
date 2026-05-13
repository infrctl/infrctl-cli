import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import {
  parseModelFamily,
  type ModelFamilyId
} from "../registry/families";
import { readConfig } from "../config/store";
import {
  OllamaProvider,
  assertOllamaReady,
  type ChatMessage
} from "../providers/ollama";
import { logger } from "../utils/logger";
import { withInfrctlSystemPrompt } from "../chat/systemPrompt";
import { ensureFamilyInstalled } from "../models/ensureInstalled";
import { createChatTranscript, openChatTranscript } from "../chat/transcript";
import {
  appendMessagesToSession,
  createChatSession,
  loadChatSession,
  loadLatestChatSession,
  saveChatSession,
  type ChatSession
} from "../chat/sessions";
import { brandHeader } from "../utils/brand";

export type ChatOptions = {
  yes?: boolean;
  continue?: boolean;
  resume?: string;
  forkSession?: boolean;
};

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Start an interactive local chat session")
    .argument("[family]", "model family to chat with")
    .option("-y, --yes", "pull the selected model without prompting if it is missing")
    .option("-c, --continue", "resume the latest chat session")
    .option("-r, --resume <sessionId>", "resume a chat session by id or id prefix")
    .option("--fork-session", "resume context into a new session id")
    .action(async (family?: string, options: ChatOptions = {}) => {
      await runChat(family, options);
    });
}

function printHelp(): void {
  logger.info(`Commands:
/help                 Show this help
/exit                 Quit
/clear                Clear chat history
/model                Show current model
/status               Show current session status
/transcript           Show the autosave transcript path
/save                 Show the autosave transcript path
/switch <family>      Switch to qwen, deepseek, llama, gemma, or phi
/system <prompt>      Set a system prompt
/temp <number>        Set temperature`);
}

async function resolveSession(options: {
  requestedFamily: ModelFamilyId;
  requestedBackendModel: string;
  resume?: string;
  continue?: boolean;
  forkSession?: boolean;
}): Promise<{ session: ChatSession; resumed: boolean }> {
  if (options.resume || options.continue) {
    const loaded = options.resume
      ? await loadChatSession(options.resume)
      : await loadLatestChatSession();

    if (!options.forkSession) {
      return { session: loaded, resumed: true };
    }

    return {
      session: createChatSession({
        family: loaded.family,
        backendModel: loaded.backendModel,
        messages: [...loaded.messages]
      }),
      resumed: true
    };
  }

  return {
    session: createChatSession({
      family: options.requestedFamily,
      backendModel: options.requestedBackendModel
    }),
    resumed: false
  };
}

export async function runChat(
  familyInput?: string,
  options: ChatOptions = {}
): Promise<void> {
  const config = await readConfig();
  const requestedFamily: ModelFamilyId = familyInput
    ? parseModelFamily(familyInput)
    : config.defaultFamily;
  const { session, resumed } = await resolveSession({
    requestedFamily,
    requestedBackendModel: config.families[requestedFamily].selectedTag,
    resume: options.resume,
    continue: options.continue,
    forkSession: options.forkSession
  });
  let family = session.family;
  let temperature = config.defaultTemperature;
  let systemPrompt = "";
  const messages: ChatMessage[] = [...session.messages];

  const provider = new OllamaProvider();
  await assertOllamaReady(provider);
  await ensureFamilyInstalled(config, provider, family, { yes: options.yes });
  session.backendModel = config.families[family].selectedTag;
  const transcript =
    config.chat.autoSave && session.transcriptPath
      ? openChatTranscript(session.transcriptPath)
      : config.chat.autoSave
        ? await createChatTranscript(family, config.families[family].selectedTag)
        : null;

  session.transcriptPath = transcript?.path;
  await saveChatSession(session);

  const rl = createInterface({ input, output });

  if (!resumed) {
    logger.heading(brandHeader());
    logger.info("");
  }

  logger.heading(`Using ${family}: ${config.families[family].selectedTag}`);
  logger.info(
    resumed
      ? `Resumed session: ${session.id} (${messages.length} messages)`
      : `Session: ${session.id}`
  );
  logger.info("Type /help for commands. Type /exit to quit.");
  if (transcript) {
    logger.info(`Autosaving chat to: ${transcript.path}`);
  }
  logger.info("");

  try {
    while (true) {
      const line = (await rl.question("you > ")).trim();

      if (!line) {
        continue;
      }

      if (line === "/exit") {
        break;
      }

      if (line === "/help") {
        printHelp();
        continue;
      }

      if (line === "/clear") {
        messages.length = 0;
        session.messages = [];
        await saveChatSession(session);
        await transcript?.appendEvent("Chat history cleared.");
        logger.success("Chat history cleared.");
        continue;
      }

      if (line === "/model") {
        logger.info(`${family}: ${config.families[family].selectedTag}`);
        continue;
      }

      if (line === "/status") {
        logger.info(`Session: ${session.id}`);
        logger.info(`Model: ${family} -> ${config.families[family].selectedTag}`);
        logger.info(`Messages: ${messages.length}`);
        logger.info(`Temperature: ${temperature}`);
        logger.info(`Transcript: ${transcript?.path ?? "off"}`);
        continue;
      }

      if (line === "/transcript" || line === "/save") {
        logger.info(
          transcript
            ? `Autosaving chat to: ${transcript.path}`
            : "Chat autosave is off."
        );
        continue;
      }

      if (line.startsWith("/switch ")) {
        family = parseModelFamily(line.replace("/switch ", "").trim());
        await ensureFamilyInstalled(config, provider, family, {
          yes: options.yes
        });
        await transcript?.appendEvent(
          `Switched to ${family}: ${config.families[family].selectedTag}`
        );
        session.family = family;
        session.backendModel = config.families[family].selectedTag;
        await saveChatSession(session);
        logger.success(`Switched to ${family}: ${config.families[family].selectedTag}`);
        continue;
      }

      if (line.startsWith("/system ")) {
        systemPrompt = line.replace("/system ", "").trim();
        await transcript?.appendMessage({ role: "system", content: systemPrompt });
        logger.success("System prompt updated.");
        continue;
      }

      if (line.startsWith("/temp ")) {
        const nextTemp = Number(line.replace("/temp ", "").trim());

        if (Number.isNaN(nextTemp) || nextTemp < 0 || nextTemp > 2) {
          logger.warn("Temperature must be a number between 0 and 2.");
          continue;
        }

        temperature = nextTemp;
        await transcript?.appendEvent(`Temperature set to ${temperature}.`);
        logger.success(`Temperature set to ${temperature}.`);
        continue;
      }

      if (line.startsWith("/")) {
        logger.warn("Unknown command. Type /help for commands.");
        continue;
      }

      messages.push({ role: "user", content: line });
      await transcript?.appendMessage({ role: "user", content: line });
      const chatMessages = withInfrctlSystemPrompt(messages, systemPrompt);
      const response = await provider.chat({
        model: config.families[family].selectedTag,
        messages: chatMessages,
        temperature,
        stream: false
      });

      logger.info("");
      logger.info(response);
      logger.info("");
      messages.push({ role: "assistant", content: response });
      appendMessagesToSession(session, [
        { role: "user", content: line },
        { role: "assistant", content: response }
      ]);
      await saveChatSession(session);
      await transcript?.appendMessage({ role: "assistant", content: response });
    }
  } finally {
    await transcript?.appendEvent(`Ended: ${new Date().toISOString()}`);
    rl.close();
  }
}
