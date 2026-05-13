import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getConfigDir } from "../config/store";
import type { ModelFamilyId } from "../registry/families";
import type { ChatMessage } from "../providers/ollama";

export type ChatTranscript = {
  path: string;
  appendMessage(message: ChatMessage): Promise<void>;
  appendEvent(event: string): Promise<void>;
};

function fileSafeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function titleForRole(role: ChatMessage["role"]): string {
  if (role === "user") {
    return "You";
  }

  if (role === "assistant") {
    return "Assistant";
  }

  return "System";
}

export async function createChatTranscript(
  family: ModelFamilyId,
  backendModel: string
): Promise<ChatTranscript> {
  const dir = path.join(getConfigDir(), "chats");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${fileSafeTimestamp()}-${family}.md`);
  const header = `# infrctl chat

- Family: ${family}
- Backend model: ${backendModel}
- Started: ${new Date().toISOString()}

`;

  await appendFile(filePath, header, "utf8");

  return openChatTranscript(filePath);
}

export function openChatTranscript(filePath: string): ChatTranscript {
  return {
    path: filePath,
    async appendMessage(message) {
      await appendFile(
        filePath,
        `## ${titleForRole(message.role)}\n\n${message.content.trim()}\n\n`,
        "utf8"
      );
    },
    async appendEvent(event) {
      await appendFile(filePath, `> ${event}\n\n`, "utf8");
    }
  };
}
