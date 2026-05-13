import { execa } from "execa";

export type GitStatus = {
  isRepo: boolean;
  changedFiles: string[];
  raw: string;
};

function parsePorcelainPath(line: string): string | null {
  const rawPath = line.slice(3).trim();

  if (!rawPath) {
    return null;
  }

  const renamePath = rawPath.includes(" -> ")
    ? rawPath.split(" -> ").at(-1)!
    : rawPath;

  return renamePath.replace(/^"|"$/g, "");
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  try {
    const result = await execa("git", ["status", "--porcelain"], {
      cwd,
      reject: false
    });

    if (result.exitCode !== 0) {
      return { isRepo: false, changedFiles: [], raw: result.stderr };
    }

    return {
      isRepo: true,
      changedFiles: result.stdout
        .split("\n")
        .map(parsePorcelainPath)
        .filter((file): file is string => Boolean(file)),
      raw: result.stdout
    };
  } catch {
    return { isRepo: false, changedFiles: [], raw: "" };
  }
}

export function changedFilesForPatch(
  status: GitStatus,
  files: string[]
): string[] {
  if (!status.isRepo || status.changedFiles.length === 0) {
    return [];
  }

  const changed = new Set(status.changedFiles);
  return files.filter((file) => changed.has(file));
}

export async function getGitDiff(cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["diff", "--"], {
      cwd,
      reject: false
    });

    return result.stdout || "No git diff.";
  } catch {
    return "Git diff is not available.";
  }
}
