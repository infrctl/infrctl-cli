import { describe, expect, it, vi } from "vitest";
import type { OllamaProviderLike } from "../src/providers/ollama";
import {
  ensureOllamaReadyForSetup,
  getOllamaInstallCommand,
  installOllama,
  supportsManagedOllamaInstall
} from "../src/providers/ollamaLifecycle";

function mockProvider(options: {
  installed: boolean[];
  running: boolean[];
}): OllamaProviderLike {
  return {
    isInstalled: vi.fn(async () => options.installed.shift() ?? true),
    isRunning: vi.fn(async () => options.running.shift() ?? true),
    listModels: vi.fn(),
    pullModel: vi.fn(),
    chat: vi.fn()
  };
}

const quietLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  success: vi.fn()
};

describe("ollama lifecycle", () => {
  it("supports managed Ollama install on Linux and macOS", () => {
    expect(supportsManagedOllamaInstall("linux")).toBe(true);
    expect(supportsManagedOllamaInstall("darwin")).toBe(true);
    expect(supportsManagedOllamaInstall("win32")).toBe(false);
  });

  it("builds the official Ollama install command", () => {
    expect(getOllamaInstallCommand()).toBe(
      "curl -fsSL 'https://ollama.com/install.sh' | sh"
    );
  });

  it("runs the Ollama installer through sh", async () => {
    const run = vi.fn(async () => undefined);

    await installOllama({
      platform: "linux",
      installUrl: "https://example.com/install.sh",
      stdio: "pipe",
      run
    });

    expect(run).toHaveBeenCalledWith(
      "sh",
      ["-c", "curl -fsSL 'https://example.com/install.sh' | sh"],
      { stdio: "pipe" }
    );
  });

  it("installs and starts Ollama during setup when missing", async () => {
    const provider = mockProvider({
      installed: [false, true],
      running: [false]
    });
    const installOllamaFn = vi.fn(async () => undefined);
    const startOllamaFn = vi.fn(async () => true);

    await ensureOllamaReadyForSetup(provider, {
      yes: true,
      interactive: false,
      installOllamaFn,
      startOllamaFn,
      logger: quietLogger
    });

    expect(installOllamaFn).toHaveBeenCalledOnce();
    expect(startOllamaFn).toHaveBeenCalledWith(provider);
  });

  it("respects the setup opt-out", async () => {
    const provider = mockProvider({
      installed: [false],
      running: []
    });

    await expect(
      ensureOllamaReadyForSetup(provider, {
        installOllama: false,
        logger: quietLogger
      })
    ).rejects.toThrow("Ollama is not installed");
  });
});
