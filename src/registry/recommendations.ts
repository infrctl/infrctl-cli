import {
  FAMILY_IDS,
  MODEL_FAMILIES,
  type ModelCandidate,
  type ModelFamilyId
} from "./families";

export type RecommendationTier = "low" | "normal" | "strong";

export type FamilyRecommendation = {
  family: ModelFamilyId;
  tier: RecommendationTier;
  selectedTag: string;
  candidate: ModelCandidate;
};

const TIER_TAGS: Record<
  RecommendationTier,
  Record<ModelFamilyId, string>
> = {
  low: {
    qwen: "qwen3:4b",
    deepseek: "deepseek-r1:1.5b",
    llama: "llama3.2:3b",
    gemma: "gemma3:4b",
    phi: "phi4-mini"
  },
  normal: {
    qwen: "qwen3:8b",
    deepseek: "deepseek-r1:8b",
    llama: "llama3.1:8b",
    gemma: "gemma3:4b",
    phi: "phi4-mini"
  },
  strong: {
    qwen: "qwen3:14b",
    deepseek: "deepseek-r1:14b",
    llama: "llama3.1:8b",
    gemma: "gemma3:12b",
    phi: "phi4-mini"
  }
};

export function getRecommendationTier(totalRamGb?: number): RecommendationTier {
  if (totalRamGb === undefined || Number.isNaN(totalRamGb)) {
    return "normal";
  }

  if (totalRamGb >= 32) {
    return "strong";
  }

  if (totalRamGb >= 16) {
    return "normal";
  }

  return "low";
}

export function recommendFamily(
  family: ModelFamilyId,
  totalRamGb?: number
): FamilyRecommendation {
  const tier = getRecommendationTier(totalRamGb);
  const selectedTag = TIER_TAGS[tier][family];
  const candidate = MODEL_FAMILIES[family].candidates.find(
    (item) => item.tag === selectedTag
  );

  if (!candidate) {
    throw new Error(`No candidate found for ${family} ${selectedTag}`);
  }

  return {
    family,
    tier,
    selectedTag,
    candidate
  };
}

export function recommendAll(
  totalRamGb?: number
): Record<ModelFamilyId, FamilyRecommendation> {
  return Object.fromEntries(
    FAMILY_IDS.map((family) => [family, recommendFamily(family, totalRamGb)])
  ) as Record<ModelFamilyId, FamilyRecommendation>;
}
