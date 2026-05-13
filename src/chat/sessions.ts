import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfigDir } from "../config/store";
import { modelFamilySchema } from "../config/schema";
import type { ChatMessage } from "../providers/ollama";
import type { ModelFamilyId } from "../registry/families";
import { InfrctlError } from "../utils/errors";

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string()
});

const chatSessionSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  family: modelFamilySchema,
  backendModel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  transcriptPath: z.string().optional(),
  messages: z.array(chatMessageSchema)
});

export type ChatSession = z.infer<typeof chatSessionSchema>;

function sessionsDir(): string {
  return path.join(getConfigDir(), "sessions");
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

export function createSessionId(): string {
  return `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
}

export function createChatSession(input: {
  family: ModelFamilyId;
  backendModel: string;
  messages?: ChatMessage[];
  transcriptPath?: string;
}): ChatSession {
  const now = new Date().toISOString();

  return {
    version: 1,
    id: createSessionId(),
    family: input.family,
    backendModel: input.backendModel,
    createdAt: now,
    updatedAt: now,
    transcriptPath: input.transcriptPath,
    messages: input.messages ?? []
  };
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await mkdir(sessionsDir(), { recursive: true });
  await writeFile(
    sessionPath(session.id),
    `${JSON.stringify(chatSessionSchema.parse(session), null, 2)}\n`,
    "utf8"
  );
}

async function readSessionFile(fileName: string): Promise<ChatSession> {
  const text = await readFile(path.join(sessionsDir(), fileName), "utf8");
  return chatSessionSchema.parse(JSON.parse(text) as unknown);
}

export async function listChatSessions(): Promise<ChatSession[]> {
  let files: string[];

  try {
    files = await readdir(sessionsDir());
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }

  const sessions = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readSessionFile(file).catch(() => null))
  );

  return sessions
    .filter((session): session is ChatSession => session !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadChatSession(idOrPrefix: string): Promise<ChatSession> {
  const sessions = await listChatSessions();
  const matches = sessions.filter(
    (session) => session.id === idOrPrefix || session.id.startsWith(idOrPrefix)
  );

  if (matches.length === 0) {
    throw new InfrctlError(`No infrctl chat session found for: ${idOrPrefix}`);
  }

  if (matches.length > 1) {
    throw new InfrctlError(`Multiple sessions match ${idOrPrefix}.

Use a longer session id.`);
  }

  return matches[0]!;
}

export async function loadLatestChatSession(): Promise<ChatSession> {
  const [latest] = await listChatSessions();

  if (!latest) {
    throw new InfrctlError(`No infrctl chat sessions found yet.

Start one with:
infrctl`);
  }

  return latest;
}

export function appendMessagesToSession(
  session: ChatSession,
  messages: ChatMessage[]
): ChatSession {
  session.messages.push(...messages);
  session.updatedAt = new Date().toISOString();
  return session;
}
