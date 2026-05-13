import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTestPlan,
  detectPackageManager,
  runSmithTests
} from "../src/agent/testRunner";

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "infrctl-smith-tests-"));
}

describe("Smith test runner", () => {
  it("detects npm scripts and chooses a small test command", async () => {
    const cwd = await tempDir();
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ scripts: { test: "vitest", build: "tsc" } })
    );

    await expect(detectPackageManager(cwd)).resolves.toBe("npm");
    await expect(createTestPlan(cwd, "small")).resolves.toMatchObject({
      packageManager: "npm",
      commands: [{ command: "npm", args: ["test"] }]
    });
  });

  it("does not execute commands during dry runs", async () => {
    const cwd = await tempDir();
    await writeFile(
      path.join(cwd, "package.json"),
      JSON.stringify({ scripts: { test: "node missing.js" } })
    );

    const result = await runSmithTests({
      cwd,
      scope: "small",
      policy: "safe",
      dryRun: true
    });

    expect(result.ran).toBe(false);
    expect(result.commands).toEqual(["npm test"]);
    expect(result.output).toContain("Dry run");
  });
});
