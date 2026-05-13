import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultConfig,
  getConfigPath,
  readConfig,
  setDefaultFamily,
  writeConfig
} from "../src/config/store";

describe("config store", () => {
  let previousConfigDir: string | undefined;

  beforeEach(async () => {
    previousConfigDir = process.env.INFRCTL_CONFIG_DIR;
    process.env.INFRCTL_CONFIG_DIR = await mkdtemp(
      path.join(os.tmpdir(), "infrctl-test-")
    );
  });

  afterEach(() => {
    if (previousConfigDir === undefined) {
      delete process.env.INFRCTL_CONFIG_DIR;
    } else {
      process.env.INFRCTL_CONFIG_DIR = previousConfigDir;
    }
  });

  it("returns a valid default config when missing", async () => {
    const config = await readConfig();

    expect(config.version).toBe(1);
    expect(config.defaultFamily).toBe("qwen");
    expect(config.chat.autoSave).toBe(true);
    expect(config.families.phi.selectedTag).toBe("phi4-mini");
  });

  it("repairs missing fields from defaults", async () => {
    await writeFile(getConfigPath(), JSON.stringify({ defaultFamily: "phi" }));

    const config = await readConfig();

    expect(config.defaultFamily).toBe("phi");
    expect(config.serve.port).toBe(8787);
    expect(config.families.qwen.selectedTag).toBe("qwen3:8b");
  });

  it("persists setting the default family", async () => {
    await writeConfig(defaultConfig());
    const config = await setDefaultFamily("phi");

    expect(config.defaultFamily).toBe("phi");
    await expect(readConfig()).resolves.toMatchObject({ defaultFamily: "phi" });
  });

  it("rejects unknown default families cleanly", async () => {
    await writeConfig(defaultConfig());

    await expect(setDefaultFamily("claude")).rejects.toThrow(
      "Unknown model family"
    );
  });
});
