import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerCompletionCommand } from "../src/commands/completion";
import { mergeSmithOptions, resolveModes } from "../src/commands/smith";
import { defaultConfig } from "../src/config/store";

describe("Smith config and completions", () => {
  it("adds Smith defaults to config", () => {
    expect(defaultConfig().agent).toEqual({
      profile: "normal",
      approvalMode: "ask",
      shellPolicy: "ask",
      maxSteps: 16,
      maxContextChars: 60_000
    });
  });

  it("includes Smith in shell completion output", async () => {
    const program = new Command();
    const logs: string[] = [];
    const previousLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(String(value));
    };

    try {
      registerCompletionCommand(program);
      await program.parseAsync(["node", "test", "completion", "bash"]);
    } finally {
      console.log = previousLog;
    }

    expect(logs.join("\n")).toContain("smith");
  });

  it("merges root model options into the Smith command", () => {
    expect(mergeSmithOptions({ profile: "safe" }, { model: "phi" })).toMatchObject({
      model: "phi",
      profile: "safe"
    });
    expect(
      mergeSmithOptions({ model: "qwen" }, { model: "phi" })
    ).toMatchObject({
      model: "qwen"
    });
  });

  it("keeps safe profile read-only without step-gating reads", () => {
    expect(resolveModes(defaultConfig(), { profile: "safe" })).toEqual({
      profile: "safe",
      approvalMode: "ask",
      shellPolicy: "off",
      readOnly: true
    });
  });
});
