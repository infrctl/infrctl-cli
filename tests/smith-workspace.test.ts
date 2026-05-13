import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPatchEdits,
  applyUnifiedPatch,
  undoLatestPatch
} from "../src/agent/patch";
import {
  assertSafeWorkspacePath,
  scanWorkspace
} from "../src/agent/workspace";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-"));
}

describe("Smith workspace safety", () => {
  const previousConfigDir = process.env.INFRCTL_CONFIG_DIR;

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.INFRCTL_CONFIG_DIR;
    } else {
      process.env.INFRCTL_CONFIG_DIR = previousConfigDir;
    }
  });

  it("blocks absolute, parent, and ignored paths", async () => {
    const root = await tempDir();

    expect(() => assertSafeWorkspacePath(root, "/tmp/file")).toThrow(
      "absolute file paths"
    );
    expect(() => assertSafeWorkspacePath(root, "../file")).toThrow(
      "outside the workspace"
    );
    expect(() => assertSafeWorkspacePath(root, "node_modules/pkg/index.js")).toThrow(
      "ignored path"
    );
  });

  it("scans files without generated directories", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "README.md"), "hello");
    await mkdir(path.join(root, ".next"), { recursive: true });
    await writeFile(path.join(root, ".next", "cache.txt"), "skip");

    const scan = await scanWorkspace(root);

    expect(scan.files.map((file) => file.path)).toContain("README.md");
    expect(scan.files.map((file) => file.path)).not.toContain(".next/cache.txt");
  });

  it("applies approved whole-file edits", async () => {
    const root = await tempDir();

    await applyPatchEdits(root, [{ path: "src/a.ts", content: "export const a = 1;\n" }]);

    await expect(readFile(path.join(root, "src", "a.ts"), "utf8")).resolves.toBe(
      "export const a = 1;\n"
    );
  });

  it("blocks symlink writes", async () => {
    const root = await tempDir();
    const outside = path.join(await tempDir(), "outside.txt");
    await writeFile(outside, "secret");
    await symlink(outside, path.join(root, "link.txt"));

    await expect(
      applyPatchEdits(root, [{ path: "link.txt", content: "changed" }])
    ).rejects.toThrow("symlink");
  });

  it("applies unified diffs and can undo them", async () => {
    const root = await tempDir();
    process.env.INFRCTL_CONFIG_DIR = await tempDir();
    await writeFile(path.join(root, "index.ts"), "old\n");
    const patch = `diff --git a/index.ts b/index.ts
--- a/index.ts
+++ b/index.ts
@@ -1 +1 @@
-old
+new
`;

    const result = await applyUnifiedPatch({
      root,
      summary: "change index",
      patch
    });

    expect(result.applied).toBe(true);
    expect(result.files).toEqual(["index.ts"]);
    await expect(readFile(path.join(root, "index.ts"), "utf8")).resolves.toBe("new\n");

    const backup = await undoLatestPatch(root);

    expect(backup.summary).toBe("change index");
    await expect(readFile(path.join(root, "index.ts"), "utf8")).resolves.toBe("old\n");
  });
});
