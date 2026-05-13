import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChatTranscript } from "../src/chat/transcript";

describe("chat transcript", () => {
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.INFRCTL_CONFIG_DIR;
    process.env.INFRCTL_CONFIG_DIR = await mkdtemp(
      path.join(os.tmpdir(), "infrctl-transcript-")
    );
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.INFRCTL_CONFIG_DIR;
    } else {
      process.env.INFRCTL_CONFIG_DIR = previousConfigDir;
    }
  });

  it("writes chat messages to a markdown transcript", async () => {
    const transcript = await createChatTranscript("phi", "phi4-mini");

    await transcript.appendMessage({ role: "user", content: "hello" });
    await transcript.appendMessage({ role: "assistant", content: "hi" });

    const text = await readFile(transcript.path, "utf8");

    expect(text).toContain("# infrctl chat");
    expect(text).toContain("- Family: phi");
    expect(text).toContain("## You");
    expect(text).toContain("hello");
    expect(text).toContain("## Assistant");
    expect(text).toContain("hi");
  });
});
