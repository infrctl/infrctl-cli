import { z } from "zod";
import { ValidationError } from "../utils/errors";

export const patchEditSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

const respondActionSchema = z.object({
  action: z.literal("respond"),
  message: z.string().min(1)
});

const planActionSchema = z.object({
  action: z.literal("plan"),
  steps: z.array(z.string().min(1)).min(1)
});

const readFileActionSchema = z.object({
  action: z.literal("read_file"),
  path: z.string().min(1)
});

const searchActionSchema = z.object({
  action: z.literal("search"),
  query: z.string().min(1),
  glob: z.string().min(1).optional()
});

const proposePatchActionSchema = z
  .object({
    action: z.literal("propose_patch"),
    summary: z.string().min(1),
    patch: z.string().min(1).optional(),
    edits: z.array(patchEditSchema).min(1).optional()
  })
  .refine((value) => Boolean(value.patch || value.edits), {
    message: "propose_patch requires patch or edits"
  });

const runCommandActionSchema = z.object({
  action: z.literal("run_command"),
  command: z.string().min(1),
  args: z.array(z.string()).default([])
});

const runTestsActionSchema = z.object({
  action: z.literal("run_tests"),
  scope: z.enum(["small", "full"]).default("small")
});

export const smithActionSchema = z.union([
  respondActionSchema,
  planActionSchema,
  readFileActionSchema,
  searchActionSchema,
  proposePatchActionSchema,
  runCommandActionSchema,
  runTestsActionSchema
]);

export type PatchEdit = z.infer<typeof patchEditSchema>;
export type SmithAction = z.infer<typeof smithActionSchema>;

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractFirstJsonObject(text: string): string {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf("{");

  if (start === -1) {
    return stripped;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < stripped.length; index += 1) {
    const char = stripped[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return stripped.slice(start, index + 1);
      }
    }
  }

  return stripped;
}

export function parseSmithAction(text: string): SmithAction {
  const jsonText = extractFirstJsonObject(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new ValidationError("Smith returned invalid JSON.");
  }

  const result = smithActionSchema.safeParse(parsed);

  if (!result.success) {
    throw new ValidationError(
      `Smith returned an unsupported action: ${result.error.issues
        .map((issue) => issue.message)
        .join(", ")}`
    );
  }

  return result.data;
}
