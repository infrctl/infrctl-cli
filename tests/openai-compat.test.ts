import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config/store";
import { createServer } from "../src/server/createServer";
import type { OllamaProviderLike } from "../src/providers/ollama";
import { INFRCTL_BRAND_SYSTEM_PROMPT } from "../src/chat/systemPrompt";

function mockProvider(): OllamaProviderLike {
  return {
    isInstalled: vi.fn().mockResolvedValue(true),
    isRunning: vi.fn().mockResolvedValue(true),
    listModels: vi.fn().mockResolvedValue(["phi4-mini"]),
    pullModel: vi.fn().mockResolvedValue(undefined),
    chat: vi.fn().mockResolvedValue("Hello from infrctl.")
  };
}

describe("OpenAI-compatible server", () => {
  it("returns health", async () => {
    const app = createServer({ config: defaultConfig(), provider: mockProvider() });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "infrctl",
      backend: "ollama"
    });
  });

  it("returns model list", async () => {
    const app = createServer({ config: defaultConfig(), provider: mockProvider() });
    const response = await app.inject({ method: "GET", url: "/v1/models" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(5);
  });

  it("validates messages and delegates chat", async () => {
    const provider = mockProvider();
    const app = createServer({ config: defaultConfig(), provider });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "phi",
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("Hello from infrctl.");
    expect(response.json()).toMatchObject({
      model: "phi",
      backend_model: "phi4-mini",
      infrctl: {
        backend: "ollama",
        model: "phi",
        backend_model: "phi4-mini"
      }
    });
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "phi4-mini",
        messages: [
          { role: "system", content: INFRCTL_BRAND_SYSTEM_PROMPT },
          { role: "user", content: "hello" }
        ]
      })
    );
  });

  it("returns a useful error for unknown model", async () => {
    const app = createServer({ config: defaultConfig(), provider: mockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "claude",
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("Unknown model");
  });

  it("returns a clear error for streaming", async () => {
    const app = createServer({ config: defaultConfig(), provider: mockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "phi",
        stream: true,
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.type).toBe("unsupported_feature");
  });
});
