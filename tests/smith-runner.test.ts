import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSmithAgent } from "../src/agent/runner";
import type { OllamaProviderLike } from "../src/providers/ollama";

function mockProvider(responses: string[]): Pick<OllamaProviderLike, "chat"> {
  return {
    chat: vi.fn().mockImplementation(() => {
      const next = responses.shift();

      if (!next) {
        throw new Error("No mock response left");
      }

      return Promise.resolve(next);
    })
  };
}

describe("Smith runner", () => {
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.INFRCTL_CONFIG_DIR;
    process.env.INFRCTL_CONFIG_DIR = await mkdtemp(
      path.join(os.tmpdir(), "infrctl-smith-config-")
    );
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.INFRCTL_CONFIG_DIR;
    } else {
      process.env.INFRCTL_CONFIG_DIR = previousConfigDir;
    }
  });

  it("reads, applies an approved patch, and responds", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    await writeFile(path.join(cwd, "index.ts"), "export const name = 'old';\n");
    const provider = mockProvider([
      '{"action":"read_file","path":"index.ts"}',
      '{"action":"propose_patch","summary":"rename value","edits":[{"path":"index.ts","content":"export const name = \\"new\\";\\n"}]}',
      '{"action":"respond","message":"done"}'
    ]);

    const result = await runSmithAgent({
      task: "rename value",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "ask",
      shellPolicy: "off",
      approve: vi.fn().mockResolvedValue(true)
    });

    expect(result.message).toBe("done");
    await expect(readFile(path.join(cwd, "index.ts"), "utf8")).resolves.toBe(
      'export const name = "new";\n'
    );
  });

  it("plans, applies unified diff patches, and reports patch metadata", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    await writeFile(path.join(cwd, "index.ts"), "old\n");
    const provider = mockProvider([
      '{"action":"plan","steps":["read index","patch index"]}',
      '{"action":"propose_patch","summary":"change index","patch":"diff --git a/index.ts b/index.ts\\n--- a/index.ts\\n+++ b/index.ts\\n@@ -1 +1 @@\\n-old\\n+new\\n"}',
      '{"action":"respond","message":"done"}'
    ]);

    const result = await runSmithAgent({
      task: "change index",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "ask",
      shellPolicy: "off",
      approve: vi.fn().mockResolvedValue(true)
    });

    expect(result.plan).toEqual(["read index", "patch index"]);
    expect(result.patches[0]).toMatchObject({
      summary: "change index",
      applied: true,
      files: ["index.ts"]
    });
    await expect(readFile(path.join(cwd, "index.ts"), "utf8")).resolves.toBe("new\n");
  });

  it("captures patches without applying in dry-run mode", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    await writeFile(path.join(cwd, "index.ts"), "old\n");
    const provider = mockProvider([
      '{"action":"propose_patch","summary":"change index","patch":"diff --git a/index.ts b/index.ts\\n--- a/index.ts\\n+++ b/index.ts\\n@@ -1 +1 @@\\n-old\\n+new\\n"}',
      '{"action":"respond","message":"dry"}'
    ]);

    const result = await runSmithAgent({
      task: "change index",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "auto-edit",
      shellPolicy: "safe",
      dryRun: true
    });

    expect(result.patches[0]).toMatchObject({
      applied: false,
      dryRun: true
    });
    await expect(readFile(path.join(cwd, "index.ts"), "utf8")).resolves.toBe("old\n");
  });

  it("allows read-only safe flows without an approval handler", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    await writeFile(path.join(cwd, "package.json"), '{"name":"safe-read"}\n');
    const provider = mockProvider([
      '{"action":"read_file","path":"package.json"}',
      '{"action":"respond","message":"safe-read"}'
    ]);

    const result = await runSmithAgent({
      task: "read package name",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "ask",
      shellPolicy: "off",
      readOnly: true
    });

    expect(result.message).toBe("safe-read");
  });

  it("does not apply a denied patch", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    await writeFile(path.join(cwd, "index.ts"), "old\n");
    const provider = mockProvider([
      '{"action":"propose_patch","summary":"change file","edits":[{"path":"index.ts","content":"new\\n"}]}',
      '{"action":"respond","message":"left unchanged"}'
    ]);

    const result = await runSmithAgent({
      task: "change file",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "ask",
      shellPolicy: "off",
      approve: vi.fn().mockResolvedValue(false)
    });

    expect(result.message).toBe("left unchanged");
    await expect(readFile(path.join(cwd, "index.ts"), "utf8")).resolves.toBe("old\n");
  });

  it("recovers once from malformed model output", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-run-"));
    const provider = mockProvider([
      "not json",
      '{"action":"respond","message":"fixed"}'
    ]);

    const result = await runSmithAgent({
      task: "answer",
      cwd,
      family: "phi",
      backendModel: "phi4-mini",
      provider,
      approvalMode: "ask",
      shellPolicy: "off"
    });

    expect(result.message).toBe("fixed");
  });
});
