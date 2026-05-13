import { describe, expect, it, vi } from "vitest";
import type { OllamaProviderLike } from "../src/providers/ollama";
import { ensureOllamaReadyForSetup } from "../src/providers/ollamaLifecycle";

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
  it("starts Ollama during setup when it is installed but not running", async () => {
    const provider = mockProvider({
      installed: [true],
      running: [false]
    });
    const startOllamaFn = vi.fn(async () => true);

    await ensureOllamaReadyForSetup(provider, {
      yes: true,
      interactive: false,
      startOllamaFn,
      logger: quietLogger
    });

    expect(startOllamaFn).toHaveBeenCalledWith(provider);
  });

  it("does not install Ollama from the npm package", async () => {
    const provider = mockProvider({
      installed: [false],
      running: []
    });

    await expect(
      ensureOllamaReadyForSetup(provider, {
        yes: true,
        interactive: false,
        logger: quietLogger
      })
    ).rejects.toThrow("Ollama is not installed");
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
