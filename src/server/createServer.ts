import Fastify, { type FastifyInstance } from "fastify";
import type { InfrctlConfig } from "../config/schema";
import { OllamaProvider, type OllamaProviderLike } from "../providers/ollama";
import {
  chatCompletionRequestSchema,
  createChatCompletionResponse,
  createErrorResponse,
  listOpenAIModels,
  resolveRequestedModel
} from "./openaiCompat";
import { withInfrctlSystemPrompt } from "../chat/systemPrompt";

export type CreateServerOptions = {
  config: InfrctlConfig;
  provider?: OllamaProviderLike;
};

export function createServer(options: CreateServerOptions): FastifyInstance {
  const provider = options.provider ?? new OllamaProvider();
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    service: "infrctl",
    backend: "ollama"
  }));

  app.get("/v1/models", async () => listOpenAIModels(options.config));

  app.post("/v1/chat/completions", async (request, reply) => {
    const parsed = chatCompletionRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply
        .code(400)
        .send(createErrorResponse(parsed.error.issues[0]?.message ?? "Invalid request"));
    }

    if (parsed.data.stream) {
      return reply
        .code(400)
        .send(
          createErrorResponse(
            "Streaming is not supported in this version of infrctl serve.",
            "unsupported_feature"
          )
        );
    }

    const resolved = resolveRequestedModel(parsed.data.model, options.config);

    if (!resolved) {
      return reply
        .code(400)
        .send(
          createErrorResponse(
            `Unknown model: ${parsed.data.model}. Supported models: qwen, deepseek, llama, gemma, phi`
          )
        );
    }

    try {
      const content = await provider.chat({
        model: resolved.backendModel,
        messages: withInfrctlSystemPrompt(parsed.data.messages),
        temperature:
          parsed.data.temperature ?? options.config.defaultTemperature,
        stream: false
      });

      return createChatCompletionResponse({
        model: resolved.requestedModel,
        backendModel: resolved.backendModel,
        content
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return reply
        .code(502)
        .send(createErrorResponse(message, "backend_error"));
    }
  });

  return app;
}
