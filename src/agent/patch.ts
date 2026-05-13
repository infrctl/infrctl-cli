import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type { PatchEdit } from "./actions";
import {
  assertWritableWorkspacePath,
  isBinaryBuffer,
  readWorkspaceFile
} from "./workspace";
import { getConfigDir } from "../config/store";
import { ValidationError } from "../utils/errors";

const MAX_PATCH_FILE_BYTES = 1_000_000;
const MAX_PREVIEW_LINES_PER_FILE = 160;
const PATCH_BACKUP_VERSION = 1;

export type ValidatedPatchEdit = PatchEdit & {
  absolutePath: string;
  exists: boolean;
};

export type PatchBackupFile = {
  path: string;
  existed: boolean;
  content?: string;
};

export type PatchBackup = {
  version: 1;
  id: string;
  cwd: string;
  summary: string;
  patch: string;
  createdAt: string;
  files: PatchBackupFile[];
};

export type PatchApplyResult = {
  files: string[];
  backupId?: string;
  applied: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const result = await stat(filePath);
    return result.isFile();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

export async function validatePatchEdits(
  root: string,
  edits: PatchEdit[]
): Promise<ValidatedPatchEdit[]> {
  const seen = new Set<string>();
  const validated: ValidatedPatchEdit[] = [];

  for (const edit of edits) {
    if (Buffer.byteLength(edit.content, "utf8") > MAX_PATCH_FILE_BYTES) {
      throw new ValidationError(`Patch file is too large: ${edit.path}`);
    }

    if (edit.content.includes("\0")) {
      throw new ValidationError(`Patch content looks binary: ${edit.path}`);
    }

    const absolutePath = await assertWritableWorkspacePath(root, edit.path);

    if (seen.has(absolutePath)) {
      throw new ValidationError(`Patch edits the same file more than once: ${edit.path}`);
    }

    seen.add(absolutePath);
    const exists = await fileExists(absolutePath);

    if (exists) {
      const current = await readFile(absolutePath);

      if (isBinaryBuffer(current)) {
        throw new ValidationError(`Smith cannot edit binary file: ${edit.path}`);
      }
    }

    validated.push({ ...edit, absolutePath, exists });
  }

  return validated;
}

function previewLines(prefix: string, content: string): string[] {
  return content
    .split("\n")
    .slice(0, MAX_PREVIEW_LINES_PER_FILE)
    .map((line) => `${prefix}${line}`);
}

export async function createPatchPreview(
  root: string,
  edits: PatchEdit[]
): Promise<string> {
  const chunks: string[] = [];

  for (const edit of edits) {
    let previous = "";

    try {
      previous = await readWorkspaceFile(root, edit.path, MAX_PATCH_FILE_BYTES);
    } catch {
      previous = "";
    }

    chunks.push(`--- a/${edit.path}`);
    chunks.push(`+++ b/${edit.path}`);
    chunks.push("@@ whole file @@");
    chunks.push(...previewLines("-", previous));
    chunks.push(...previewLines("+", edit.content));

    if (
      previous.split("\n").length > MAX_PREVIEW_LINES_PER_FILE ||
      edit.content.split("\n").length > MAX_PREVIEW_LINES_PER_FILE
    ) {
      chunks.push("[diff preview truncated]");
    }
  }

  return chunks.join("\n");
}

export async function applyPatchEdits(
  root: string,
  edits: PatchEdit[]
): Promise<string[]> {
  const validated = await validatePatchEdits(root, edits);

  for (const edit of validated) {
    await mkdir(path.dirname(edit.absolutePath), { recursive: true });
    await writeFile(edit.absolutePath, edit.content, "utf8");
  }

  return validated.map((edit) => edit.path);
}

function backupsDir(): string {
  return path.join(getConfigDir(), "agent-patches");
}

function backupPath(id: string): string {
  return path.join(backupsDir(), `${id}.json`);
}

function stripDiffPath(raw: string): string | null {
  const trimmed = raw.trim();

  if (trimmed === "/dev/null") {
    return null;
  }

  const withoutPrefix = trimmed.replace(/^[ab]\//, "");
  return withoutPrefix.replace(/\t.*$/, "").replace(/^"|"$/g, "");
}

export function parseUnifiedDiffFiles(patch: string): string[] {
  const files = new Set<string>();

  for (const line of patch.split("\n")) {
    if (!line.startsWith("+++ ")) {
      continue;
    }

    const file = stripDiffPath(line.slice(4));

    if (file) {
      files.add(file);
    }
  }

  return Array.from(files);
}

export async function validateUnifiedPatch(
  root: string,
  patch: string
): Promise<string[]> {
  if (!patch.includes("@@")) {
    throw new ValidationError("Smith patch must be a unified diff with hunks.");
  }

  const files = parseUnifiedDiffFiles(patch);

  if (files.length === 0) {
    throw new ValidationError("Smith patch does not contain changed files.");
  }

  for (const file of files) {
    const absolutePath = await assertWritableWorkspacePath(root, file);

    try {
      const current = await readFile(absolutePath);

      if (isBinaryBuffer(current)) {
        throw new ValidationError(`Smith cannot edit binary file: ${file}`);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      throw error;
    }
  }

  const check = await execa("git", ["apply", "--check", "--whitespace=nowarn"], {
    cwd: root,
    input: patch,
    reject: false
  });

  if (check.exitCode !== 0) {
    throw new ValidationError(
      `Smith patch did not apply cleanly:\n${check.stderr || check.stdout}`
    );
  }

  return files;
}

async function createPatchBackup(
  root: string,
  summary: string,
  patch: string,
  files: string[]
): Promise<PatchBackup> {
  const backupFiles: PatchBackupFile[] = [];

  for (const file of files) {
    const absolutePath = await assertWritableWorkspacePath(root, file);

    try {
      backupFiles.push({
        path: file,
        existed: true,
        content: await readFile(absolutePath, "utf8")
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        backupFiles.push({ path: file, existed: false });
        continue;
      }

      throw error;
    }
  }

  return {
    version: PATCH_BACKUP_VERSION,
    id: `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`,
    cwd: root,
    summary,
    patch,
    createdAt: new Date().toISOString(),
    files: backupFiles
  };
}

async function savePatchBackup(backup: PatchBackup): Promise<void> {
  await mkdir(backupsDir(), { recursive: true });
  await writeFile(
    backupPath(backup.id),
    `${JSON.stringify(backup, null, 2)}\n`,
    "utf8"
  );
}

export async function applyUnifiedPatch(input: {
  root: string;
  summary: string;
  patch: string;
  dryRun?: boolean;
}): Promise<PatchApplyResult> {
  const files = await validateUnifiedPatch(input.root, input.patch);

  if (input.dryRun) {
    return { files, applied: false };
  }

  const backup = await createPatchBackup(
    input.root,
    input.summary,
    input.patch,
    files
  );
  await savePatchBackup(backup);

  const result = await execa("git", ["apply", "--whitespace=nowarn"], {
    cwd: input.root,
    input: input.patch,
    reject: false
  });

  if (result.exitCode !== 0) {
    throw new ValidationError(
      `Smith patch failed while applying:\n${result.stderr || result.stdout}`
    );
  }

  return {
    files,
    backupId: backup.id,
    applied: true
  };
}

async function readBackup(fileName: string): Promise<PatchBackup | null> {
  try {
    const raw = await readFile(path.join(backupsDir(), fileName), "utf8");
    const parsed = JSON.parse(raw) as PatchBackup;
    return parsed.version === PATCH_BACKUP_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export async function listPatchBackups(cwd: string): Promise<PatchBackup[]> {
  let files: string[];

  try {
    files = await readdir(backupsDir());
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

  const backups = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readBackup(file))
  );

  return backups
    .filter((backup): backup is PatchBackup => backup !== null)
    .filter((backup) => backup.cwd === cwd)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function undoLatestPatch(cwd: string): Promise<PatchBackup> {
  const [latest] = await listPatchBackups(cwd);

  if (!latest) {
    throw new ValidationError("No Smith patch backup found for this workspace.");
  }

  for (const file of latest.files) {
    const absolutePath = await assertWritableWorkspacePath(cwd, file.path);

    if (file.existed) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content ?? "", "utf8");
    } else {
      await rm(absolutePath, { force: true });
    }
  }

  return latest;
}
