import { z } from "zod";
import { FAMILY_IDS } from "../registry/families";

export const modelFamilySchema = z.enum(FAMILY_IDS);

export const familyConfigSchema = z.object({
  selectedTag: z.string().min(1)
});

export const infrctlConfigSchema = z.object({
  version: z.literal(1),
  defaultFamily: modelFamilySchema,
  backend: z.literal("ollama"),
  defaultTemperature: z.number().min(0).max(2),
  setupCompleted: z.boolean(),
  chat: z.object({
    autoSave: z.boolean()
  }),
  agent: z.object({
    profile: z.enum(["safe", "normal", "fast", "danger"]),
    approvalMode: z.enum(["ask", "step", "auto-edit"]),
    shellPolicy: z.enum(["ask", "safe", "off"]),
    maxSteps: z.number().int().min(1).max(50),
    maxContextChars: z.number().int().min(10_000).max(200_000)
  }),
  serve: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535)
  }),
  families: z.object({
    qwen: familyConfigSchema,
    deepseek: familyConfigSchema,
    llama: familyConfigSchema,
    gemma: familyConfigSchema,
    phi: familyConfigSchema
  })
});

export type InfrctlConfig = z.infer<typeof infrctlConfigSchema>;
