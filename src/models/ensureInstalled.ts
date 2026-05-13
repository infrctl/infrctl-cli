import { confirm } from "@inquirer/prompts";
import type { InfrctlConfig } from "../config/schema";
import type { OllamaProviderLike } from "../providers/ollama";
import { MODEL_FAMILIES, type ModelFamilyId } from "../registry/families";
import { InfrctlError } from "../utils/errors";
import { logger } from "../utils/logger";
import { hasInstalledTag } from "./tags";

export type EnsureModelInstalledOptions = {
  yes?: boolean;
  prompt?: boolean;
};

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function isFamilyInstalled(
  config: InfrctlConfig,
  provider: OllamaProviderLike,
  family: ModelFamilyId
): Promise<boolean> {
  const installedModels = await provider.listModels();
  return hasInstalledTag(installedModels, config.families[family].selectedTag);
}

export async function ensureFamilyInstalled(
  config: InfrctlConfig,
  provider: OllamaProviderLike,
  family: ModelFamilyId,
  options: EnsureModelInstalledOptions = {}
): Promise<void> {
  const tag = config.families[family].selectedTag;

  if (await isFamilyInstalled(config, provider, family)) {
    return;
  }

  const displayName = MODEL_FAMILIES[family].displayName;
  const shouldPull =
    options.yes ||
    (options.prompt !== false &&
      isInteractive() &&
      (await confirm({
        message: `${displayName} is not installed yet. Pull ${tag} now?`,
        default: true
      })));

  if (!shouldPull) {
    throw new InfrctlError(`${displayName} is not installed yet.

Install it with:
infrctl pull ${family}`);
  }

  logger.info("");
  logger.heading(`Pulling ${family}`);
  logger.info(`Resolved model: ${tag}`);
  logger.info("Backend: Ollama");
  await provider.pullModel(tag);
  logger.success(`${displayName} is installed.`);
}
