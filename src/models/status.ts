import { detectHardware } from "../hardware/detect";
import { recommendForHardware } from "../hardware/recommend";
import type { OllamaProviderLike } from "../providers/ollama";
import {
  FAMILY_IDS,
  MODEL_FAMILIES,
  type ModelFamilyId
} from "../registry/families";
import type { InfrctlConfig } from "../config/schema";
import { hasInstalledTag } from "./tags";

export type ModelInstallStatus = {
  family: ModelFamilyId;
  displayName: string;
  role: string;
  bestFor: string[];
  selectedTag: string;
  recommendedTag: string;
  recommendedForMachine: boolean;
  installed: boolean;
  command: string;
  candidates: Array<{
    tag: string;
    label: string;
    minRamGb: number;
    recommendedRamGb: number;
  }>;
};

export async function getModelStatuses(
  config: InfrctlConfig,
  provider: OllamaProviderLike
): Promise<ModelInstallStatus[]> {
  const [installedModels, hardware] = await Promise.all([
    provider.listModels().catch(() => []),
    detectHardware(provider)
  ]);
  const recommendations = recommendForHardware(hardware);

  return FAMILY_IDS.map((family) => {
    const selectedTag = config.families[family].selectedTag;
    const recommendedTag = recommendations[family].selectedTag;
    const modelFamily = MODEL_FAMILIES[family];

    return {
      family,
      displayName: modelFamily.displayName,
      role: modelFamily.description,
      bestFor: modelFamily.bestFor,
      selectedTag,
      recommendedTag,
      recommendedForMachine: selectedTag === recommendedTag,
      installed: hasInstalledTag(installedModels, selectedTag),
      command: `infrctl chat ${family}`,
      candidates: modelFamily.candidates.map((candidate) => ({
        tag: candidate.tag,
        label: candidate.label,
        minRamGb: candidate.minRamGb,
        recommendedRamGb: candidate.recommendedRamGb
      }))
    };
  });
}
