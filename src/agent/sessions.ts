import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getConfigDir } from "../config/store";
import { modelFamilySchema } from "../config/schema";
import type { ModelFamilyId } from "../registry/families";
import type { ApprovalMode, ShellPolicy, SmithEvent } from "./types";

const smithSessionSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  task: z.string(),
  cwd: z.string(),
  family: modelFamilySchema,
  backendModel: z.string(),
  approvalMode: z.enum(["ask", "step", "auto-edit"]),
  shellPolicy: z.enum(["ask", "safe", "off"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  events: z.array(z.unknown()),
  finalMessage: z.string().optional()
});

export type SmithSession = z.infer<typeof smithSessionSchema>;

function smithSessionsDir(): string {
  return path.join(getConfigDir(), "agent-sessions");
}

function smithSessionPath(id: string): string {
  return path.join(smithSessionsDir(), `${id}.json`);
}

export function createSmithSession(input: {
  task: string;
  cwd: string;
  family: ModelFamilyId;
  backendModel: string;
  approvalMode: ApprovalMode;
  shellPolicy: ShellPolicy;
}): SmithSession {
  const now = new Date().toISOString();

  return {
    version: 1,
    id: `${now.slice(0, 10)}-smith-${randomUUID().slice(0, 8)}`,
    task: input.task,
    cwd: input.cwd,
    family: input.family,
    backendModel: input.backendModel,
    approvalMode: input.approvalMode,
    shellPolicy: input.shellPolicy,
    createdAt: now,
    updatedAt: now,
    events: []
  };
}

export async function saveSmithSession(session: SmithSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await mkdir(smithSessionsDir(), { recursive: true });
  await writeFile(
    smithSessionPath(session.id),
    `${JSON.stringify(smithSessionSchema.parse(session), null, 2)}\n`,
    "utf8"
  );
}

export function recordSmithEvent(
  session: SmithSession,
  event: SmithEvent
): SmithSession {
  session.events.push(event);
  session.updatedAt = new Date().toISOString();
  return session;
}
