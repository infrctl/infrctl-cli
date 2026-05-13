import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/store";
import { ensureFamilyInstalled } from "../src/models/ensureInstalled";
import type { OllamaProviderLike } from "../src/providers/ollama";

function mockProvider(models: string[] = []): OllamaProviderLike {
  return {
    isInstalled: vi.fn().mockResolvedValue(true),
    isRunning: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue(models),
    pullModel: vi.fn().mockResolvedValue(undefined),
    chat: vi.fn().mockResolvedValue("ok")
  };
}

describe("ensureFamilyInstalled", () => {
  it("does nothing when the selected model is installed", async () => {
    const config = defaultConfig();
    const provider = mockProvider(["phi4-mini"]);

    await ensureFamilyInstalled(config, provider, "phi", { prompt: false });

    expect(provider.pullModel).not.toHaveBeenCalled();
  });

  it("pulls when yes is set and the selected model is missing", async () => {
    const config = defaultConfig();
    const provider = mockProvider([]);

    await ensureFamilyInstalled(config, provider, "phi", { yes: true });

    expect(provider.pullModel).toHaveBeenCalledWith("phi4-mini");
  });
});
