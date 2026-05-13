import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "../src/providers/ollama";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [{ name: "qwen3:8b" }, { model: "phi4-mini" }]
          }),
          { status: 200 }
        )
      )
    );

    const provider = new OllamaProvider("http://test");

    await expect(provider.listModels()).resolves.toEqual([
      "qwen3:8b",
      "phi4-mini"
    ]);
  });

  it("chats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { role: "assistant", content: "hello" }
          }),
          { status: 200 }
        )
      )
    );

    const provider = new OllamaProvider("http://test");

    await expect(
      provider.chat({
        model: "phi4-mini",
        messages: [{ role: "user", content: "hello" }],
        stream: false
      })
    ).resolves.toBe("hello");
  });

  it("turns connection errors into friendly messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));

    const provider = new OllamaProvider("http://test");

    await expect(provider.listModels()).rejects.toThrow(
      "Could not connect to Ollama"
    );
  });

  it("reports missing models clearly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "model not found" }), {
          status: 404
        })
      )
    );

    const provider = new OllamaProvider("http://test");

    await expect(
      provider.chat({
        model: "missing",
        messages: [{ role: "user", content: "hello" }],
        stream: false
      })
    ).rejects.toThrow("Model was not found by Ollama");
  });
});
