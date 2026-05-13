import { z } from "zod";
import {
  FAMILY_IDS,
  getCandidateByTag,
  isModelFamilyId,
  tagBelongsToFamily,
  type ModelFamilyId
} from "../registry/families";
import type { InfrctlConfig } from "../config/schema";
import { nowUnixSeconds } from "../utils/format";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1)
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().optional().default(false)
});

export type ChatCompletionRequest = z.infer<
  typeof chatCompletionRequestSchema
>;

export type ResolvedModel = {
  requestedModel: string;
  family: ModelFamilyId;
  backendModel: string;
};

export function resolveRequestedModel(
  model: string,
  config: InfrctlConfig
): ResolvedModel | null {
  if (isModelFamilyId(model)) {
    return {
      requestedModel: model,
      family: model,
      backendModel: config.families[model].selectedTag
    };
  }

  const candidate = getCandidateByTag(model);

  if (!candidate || !tagBelongsToFamily(candidate.family, model)) {
    return null;
  }

  return {
    requestedModel: candidate.family,
    family: candidate.family,
    backendModel: model
  };
}

export function createChatCompletionResponse(input: {
  model: string;
  backendModel: string;
  content: string;
}) {
  return {
    id: `chatcmpl-local-${nowUnixSeconds()}`,
    object: "chat.completion",
    created: nowUnixSeconds(),
    model: input.model,
    backend_model: input.backendModel,
    infrctl: {
      backend: "ollama",
      model: input.model,
      backend_model: input.backendModel
    },
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: input.content
        },
        finish_reason: "stop"
      }
    ]
  };
}

export function createErrorResponse(message: string, type = "invalid_request") {
  return {
    error: {
      message,
      type
    }
  };
}

export function listOpenAIModels(config: InfrctlConfig) {
  return {
    object: "list",
    data: FAMILY_IDS.map((family) => ({
      id: family,
      object: "model",
      owned_by: "infrctl",
      backend_model: config.families[family].selectedTag
    }))
  };
}
