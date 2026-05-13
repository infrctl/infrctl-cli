import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { InfrctlError, ValidationError } from "../utils/errors";

export type WorkspaceFile = {
  path: string;
  size: number;
};

export type WorkspaceScan = {
  root: string;
  files: WorkspaceFile[];
};

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  "dist",
  "dist-bin",
  "dist-standalone",
  "build",
  "node_modules",
  "target"
]);

const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_FILE_BYTES = 80_000;
const DEFAULT_SEARCH_LINES = 200;

export function isIgnoredPath(filePath: string): boolean {
  return filePath
    .split(/[\\/]/)
    .some((part) => IGNORED_DIRS.has(part) || part.endsWith(".tsbuildinfo"));
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

async function listFilesWithRg(cwd: string): Promise<string[] | null> {
  try {
    const result = await execa("rg", ["--files"], {
      cwd,
      reject: false
    });

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      return null;
    }

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function listFilesFallback(cwd: string, dir = cwd): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = normalizeRelativePath(path.relative(cwd, absolute));

    if (isIgnoredPath(relative)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await listFilesFallback(cwd, absolute)));
      continue;
    }

    if (entry.isFile()) {
      files.push(relative);
    }
  }

  return files;
}

export async function scanWorkspace(
  cwdInput: string,
  maxFiles = DEFAULT_MAX_FILES
): Promise<WorkspaceScan> {
  const root = await realpath(cwdInput);
  const listed = (await listFilesWithRg(root)) ?? (await listFilesFallback(root));
  const files: WorkspaceFile[] = [];

  for (const file of listed.filter((item) => !isIgnoredPath(item)).slice(0, maxFiles)) {
    try {
      const absolute = assertSafeWorkspacePath(root, file);
      const stats = await stat(absolute);

      if (stats.isFile()) {
        files.push({ path: normalizeRelativePath(file), size: stats.size });
      }
    } catch {
      // Ignore files that disappear or are unsafe while scanning.
    }
  }

  return { root, files };
}

export function assertSafeWorkspacePath(root: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    throw new ValidationError("Smith cannot use absolute file paths.");
  }

  const normalized = path.normalize(filePath);

  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    path.isAbsolute(normalized)
  ) {
    throw new ValidationError("Smith cannot access files outside the workspace.");
  }

  if (isIgnoredPath(normalized)) {
    throw new ValidationError(`Smith cannot access ignored path: ${filePath}`);
  }

  const resolved = path.resolve(root, normalized);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ValidationError("Smith cannot access files outside the workspace.");
  }

  return resolved;
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

async function assertPathIsNotSymlink(root: string, filePath: string): Promise<void> {
  const parts = path.normalize(filePath).split(path.sep);
  let current = root;

  for (const part of parts) {
    current = path.join(current, part);

    try {
      const stats = await lstat(current);

      if (stats.isSymbolicLink()) {
        throw new ValidationError(`Smith cannot write through symlink: ${filePath}`);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }
  }
}

export async function assertWritableWorkspacePath(
  root: string,
  filePath: string
): Promise<string> {
  const absolute = assertSafeWorkspacePath(root, filePath);
  await assertPathIsNotSymlink(root, filePath);
  return absolute;
}

export async function readWorkspaceFile(
  root: string,
  filePath: string,
  maxBytes = DEFAULT_MAX_FILE_BYTES
): Promise<string> {
  const absolute = assertSafeWorkspacePath(root, filePath);
  const buffer = await readFile(absolute);

  if (isBinaryBuffer(buffer)) {
    throw new InfrctlError(`Smith cannot read binary file: ${filePath}`);
  }

  const text = buffer.toString("utf8");

  if (buffer.byteLength <= maxBytes) {
    return text;
  }

  return `${text.slice(0, maxBytes)}\n\n[truncated after ${maxBytes} bytes]`;
}

export async function searchWorkspace(
  root: string,
  query: string,
  glob?: string,
  maxLines = DEFAULT_SEARCH_LINES
): Promise<{ output: string; matches: number }> {
  const args = [
    "--line-number",
    "--no-heading",
    "--color",
    "never",
    "--fixed-strings",
    query
  ];

  if (glob) {
    args.unshift("--glob", glob);
  }

  try {
    const result = await execa("rg", args, {
      cwd: root,
      reject: false
    });
    const lines = result.stdout
      .split("\n")
      .filter((line) => line.trim() && !isIgnoredPath(line.split(":")[0] ?? ""))
      .slice(0, maxLines);

    return {
      output: lines.join("\n") || "No matches.",
      matches: lines.length
    };
  } catch {
    return {
      output: "Search failed because ripgrep is not available.",
      matches: 0
    };
  }
}
