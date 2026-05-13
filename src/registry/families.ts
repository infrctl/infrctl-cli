import { ValidationError } from "../utils/errors";

export const FAMILY_IDS = ["qwen", "deepseek", "llama", "gemma", "phi"] as const;

export type ModelFamilyId = (typeof FAMILY_IDS)[number];

export type ModelCandidate = {
  tag: string;
  label: string;
  minRamGb: number;
  recommendedRamGb: number;
  role: string;
};

export type ModelFamily = {
  id: ModelFamilyId;
  displayName: string;
  description: string;
  bestFor: string[];
  candidates: ModelCandidate[];
};

export const MODEL_FAMILIES: Record<ModelFamilyId, ModelFamily> = {
  qwen: {
    id: "qwen",
    displayName: "Qwen",
    description:
      "Strong all-around local AI model with multilingual and coding ability.",
    bestFor: ["general chat", "coding", "multilingual tasks"],
    candidates: [
      {
        tag: "qwen3:4b",
        label: "Qwen 3 4B",
        minRamGb: 8,
        recommendedRamGb: 12,
        role: "Small Qwen model for lighter machines"
      },
      {
        tag: "qwen3:8b",
        label: "Qwen 3 8B",
        minRamGb: 12,
        recommendedRamGb: 16,
        role: "Balanced Qwen model for most users"
      },
      {
        tag: "qwen3:14b",
        label: "Qwen 3 14B",
        minRamGb: 24,
        recommendedRamGb: 32,
        role: "Stronger Qwen model for better quality"
      }
    ]
  },
  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    description: "Reasoning-focused model family for logic and code-heavy work.",
    bestFor: ["reasoning", "logic", "code-heavy thinking"],
    candidates: [
      {
        tag: "deepseek-r1:1.5b",
        label: "DeepSeek R1 1.5B",
        minRamGb: 4,
        recommendedRamGb: 8,
        role: "Tiny reasoning model for constrained machines"
      },
      {
        tag: "deepseek-r1:8b",
        label: "DeepSeek R1 8B",
        minRamGb: 12,
        recommendedRamGb: 16,
        role: "Balanced reasoning model for most users"
      },
      {
        tag: "deepseek-r1:14b",
        label: "DeepSeek R1 14B",
        minRamGb: 24,
        recommendedRamGb: 32,
        role: "Stronger reasoning model for larger machines"
      }
    ]
  },
  llama: {
    id: "llama",
    displayName: "Llama",
    description: "Popular general-purpose open model ecosystem.",
    bestFor: ["general chat", "broad ecosystem", "everyday local use"],
    candidates: [
      {
        tag: "llama3.2:3b",
        label: "Llama 3.2 3B",
        minRamGb: 6,
        recommendedRamGb: 8,
        role: "Small Llama model for lighter machines"
      },
      {
        tag: "llama3.1:8b",
        label: "Llama 3.1 8B",
        minRamGb: 12,
        recommendedRamGb: 16,
        role: "General-purpose Llama model for most users"
      }
    ]
  },
  gemma: {
    id: "gemma",
    displayName: "Gemma",
    description: "Lightweight everyday model family from Google.",
    bestFor: ["fast local use", "smaller machines", "everyday tasks"],
    candidates: [
      {
        tag: "gemma3:4b",
        label: "Gemma 3 4B",
        minRamGb: 8,
        recommendedRamGb: 12,
        role: "Lightweight Gemma model for daily use"
      },
      {
        tag: "gemma3:12b",
        label: "Gemma 3 12B",
        minRamGb: 20,
        recommendedRamGb: 32,
        role: "Larger Gemma model for stronger quality"
      }
    ]
  },
  phi: {
    id: "phi",
    displayName: "Phi",
    description: "Small and fast model family from Microsoft.",
    bestFor: ["weak machines", "quick tasks", "low-latency prompts"],
    candidates: [
      {
        tag: "phi4-mini",
        label: "Phi 4 Mini",
        minRamGb: 4,
        recommendedRamGb: 8,
        role: "Preferred small Phi model"
      },
      {
        tag: "phi3:mini",
        label: "Phi 3 Mini",
        minRamGb: 4,
        recommendedRamGb: 8,
        role: "Fallback small Phi model"
      }
    ]
  }
};

export function isModelFamilyId(value: string): value is ModelFamilyId {
  return FAMILY_IDS.includes(value as ModelFamilyId);
}

export function parseModelFamily(value: string): ModelFamilyId {
  if (isModelFamilyId(value)) {
    return value;
  }

  throw new ValidationError(`Unknown model family: ${value}

Supported model families:
${FAMILY_IDS.join(", ")}`);
}

export function getFamily(id: ModelFamilyId): ModelFamily {
  return MODEL_FAMILIES[id];
}

export function getCandidateByTag(tag: string): {
  family: ModelFamilyId;
  candidate: ModelCandidate;
} | null {
  for (const family of FAMILY_IDS) {
    const candidate = MODEL_FAMILIES[family].candidates.find(
      (item) => item.tag === tag
    );

    if (candidate) {
      return { family, candidate };
    }
  }

  return null;
}

export function tagBelongsToFamily(
  family: ModelFamilyId,
  tag: string
): boolean {
  return MODEL_FAMILIES[family].candidates.some(
    (candidate) => candidate.tag === tag
  );
}
