import {
  FAMILY_IDS,
  isModelFamilyId,
  parseModelFamily,
  type ModelFamilyId
} from "../registry/families";
import { ValidationError } from "./errors";

export function parseFamilyList(value: string): ModelFamilyId[] {
  const families = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseModelFamily);

  if (families.length === 0) {
    throw new ValidationError(
      `Expected at least one model family. Supported families: ${FAMILY_IDS.join(
        ", "
      )}`
    );
  }

  return Array.from(new Set(families));
}

export function splitFamilyAndPrompt(
  args: string[],
  defaultFamily: ModelFamilyId
): { family: ModelFamilyId; prompt: string } {
  if (args.length > 0 && isModelFamilyId(args[0])) {
    return {
      family: args[0],
      prompt: args.slice(1).join(" ")
    };
  }

  return {
    family: defaultFamily,
    prompt: args.join(" ")
  };
}

export function assertPrompt(prompt: string): void {
  if (prompt.trim().length === 0) {
    throw new ValidationError(`No prompt provided.

Examples:
infrctl ask "what is local AI?"
infrctl ask qwen "explain proof of stake simply"`);
  }
}
