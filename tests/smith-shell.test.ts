import { describe, expect, it, vi } from "vitest";
import {
  isDangerousCommand,
  isSafeCommand,
  runSmithCommand
} from "../src/agent/shell";

describe("Smith shell policy", () => {
  it("blocks dangerous commands", () => {
    expect(isDangerousCommand("rm", ["-rf", "."])).toBe(true);
    expect(isDangerousCommand("git", ["reset", "--hard"])).toBe(true);
    expect(isDangerousCommand("npm", ["publish"])).toBe(true);
    expect(isDangerousCommand("npm", ["run", "deploy"])).toBe(true);
  });

  it("allows common safe checks", () => {
    expect(isSafeCommand("npm", ["test"])).toBe(true);
    expect(isSafeCommand("npm", ["run", "build"])).toBe(true);
    expect(isSafeCommand("git", ["diff"])).toBe(true);
    expect(isSafeCommand("rg", ["hello"])).toBe(true);
  });

  it("does not run commands when shell is off", async () => {
    const approve = vi.fn().mockResolvedValue(true);
    const result = await runSmithCommand({
      cwd: process.cwd(),
      request: { command: "npm", args: ["test"] },
      policy: "off",
      approve
    });

    expect(result.ran).toBe(false);
    expect(approve).not.toHaveBeenCalled();
  });

  it("asks before running in ask mode", async () => {
    const approve = vi.fn().mockResolvedValue(false);
    const result = await runSmithCommand({
      cwd: process.cwd(),
      request: { command: "npm", args: ["test"] },
      policy: "ask",
      approve
    });

    expect(result.ran).toBe(false);
    expect(approve).toHaveBeenCalledWith(
      expect.objectContaining({ type: "command" })
    );
  });
});
