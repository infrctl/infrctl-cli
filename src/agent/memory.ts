import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfigDir } from "../config/store";
import { assertSafeWorkspacePath, readWorkspaceFile, type WorkspaceScan } from "./workspace";

export type RepoMemory = {
  version: 1;
  id: string;
  cwd: string;
  updatedAt: string;
  keyFiles: string[];
  packageManager?: string;
  scripts: Record<string, string>;
  summary: string;
};

const KEY_FILE_CANDIDATES = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "next.config.ts",
  "next.config.js",
  "foundry.toml",
  "hardhat.config.ts"
];

function memoryId(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

function memoryPath(cwd: string): string {
  return path.join(getConfigDir(), "repo-memory", `${memoryId(cwd)}.json`);
}

async function fileExists(root: string, filePath: string): Promise<boolean> {
  try {
    await readFile(assertSafeWorkspacePath(root, filePath));
    return true;
  } catch {
    return false;
  }
}

function detectPackageManager(files: string[]): string | undefined {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("package-lock.json")) return "npm";
  if (files.includes("package.json")) return "npm";
  return undefined;
}

async function readPackageScripts(root: string): Promise<Record<string, string>> {
  try {
    const raw = await readWorkspaceFile(root, "package.json", 80_000);
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

export function createRepoMap(scan: WorkspaceScan, scripts: Record<string, string>): string {
  const files = scan.files.map((file) => file.path);
  const testFiles = files.filter((file) =>
    /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
  const sourceFiles = files.filter((file) => /^src\//.test(file)).slice(0, 80);
  const docs = files.filter((file) => /\.(md|mdx)$/i.test(file)).slice(0, 30);
  const scriptLines = Object.keys(scripts).length
    ? Object.entries(scripts)
        .map(([name, command]) => `${name}: ${command}`)
        .join("\n")
    : "none detected";

  return [
    `Source files:\n${sourceFiles.join("\n") || "none detected"}`,
    `Test files:\n${testFiles.slice(0, 80).join("\n") || "none detected"}`,
    `Docs:\n${docs.join("\n") || "none detected"}`,
    `Package scripts:\n${scriptLines}`
  ].join("\n\n");
}

export async function buildRepoMemory(scan: WorkspaceScan): Promise<RepoMemory> {
  const files = scan.files.map((file) => file.path);
  const scripts = await readPackageScripts(scan.root);
  const keyFiles: string[] = [];
  const keySummaries: string[] = [];

  for (const candidate of KEY_FILE_CANDIDATES) {
    if (!(await fileExists(scan.root, candidate))) {
      continue;
    }

    keyFiles.push(candidate);
    const content = await readWorkspaceFile(scan.root, candidate, 12_000);
    keySummaries.push(`--- ${candidate} ---\n${content.slice(0, 12_000)}`);
  }

  const repoMap = createRepoMap(scan, scripts);

  return {
    version: 1,
    id: memoryId(scan.root),
    cwd: scan.root,
    updatedAt: new Date().toISOString(),
    keyFiles,
    packageManager: detectPackageManager(files),
    scripts,
    summary: `${repoMap}\n\nKey files:\n${keySummaries.join("\n\n") || "none detected"}`
  };
}

export async function saveRepoMemory(memory: RepoMemory): Promise<string> {
  const outputPath = memoryPath(memory.cwd);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function refreshRepoMemory(scan: WorkspaceScan): Promise<{
  memory: RepoMemory;
  path: string;
}> {
  const memory = await buildRepoMemory(scan);
  return {
    memory,
    path: await saveRepoMemory(memory)
  };
}
