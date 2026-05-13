import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMessagesToSession,
  createChatSession,
  listChatSessions,
  loadChatSession,
  loadLatestChatSession,
  saveChatSession
} from "../src/chat/sessions";

describe("chat sessions", () => {
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.INFRCTL_CONFIG_DIR;
    process.env.INFRCTL_CONFIG_DIR = await mkdtemp(
      path.join(os.tmpdir(), "infrctl-sessions-")
    );
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.INFRCTL_CONFIG_DIR;
    } else {
      process.env.INFRCTL_CONFIG_DIR = previousConfigDir;
    }
  });

  it("saves, lists, and resumes sessions", async () => {
    const session = createChatSession({
      family: "phi",
      backendModel: "phi4-mini"
    });

    appendMessagesToSession(session, [{ role: "user", content: "hello" }]);
    await saveChatSession(session);

    const sessions = await listChatSessions();
    const loaded = await loadChatSession(session.id.slice(0, 14));
    const latest = await loadLatestChatSession();

    expect(sessions).toHaveLength(1);
    expect(loaded.id).toBe(session.id);
    expect(latest.id).toBe(session.id);
    expect(latest.messages[0]).toMatchObject({
      role: "user",
      content: "hello"
    });
  });
});
