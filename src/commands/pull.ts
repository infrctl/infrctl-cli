import type { Command } from "commander";
import {
  FAMILY_IDS,
  parseModelFamily,
  type ModelFamilyId
} from "../registry/families";
import { detectHardware } from "../hardware/detect";
import { recommendForHardware } from "../hardware/recommend";
import { OllamaProvider, assertOllamaReady } from "../providers/ollama";
import { inspectConfig, readConfig, writeConfig } from "../config/store";
import { logger } from "../utils/logger";
import { ValidationError } from "../utils/errors";

export function registerPullCommand(program: Command): void {
  program
    .command("pull")
    .description("Pull one model family or all recommended V1 models")
    .argument("<family>", "qwen, deepseek, llama, gemma, phi, or all")
    .action(async (family: string) => {
      await runPull(family);
    });
}

async function loadConfigForPull(provider: OllamaProvider) {
  const inspection = await inspectConfig();

  if (inspection.exists) {
    return await readConfig();
  }

  const hardware = await detectHardware(provider);
  const recommendations = recommendForHardware(hardware);
  const config = inspection.config!;

  for (const family of FAMILY_IDS) {
    config.families[family].selectedTag = recommendations[family].selectedTag;
  }

  return config;
}

async function runPull(familyInput: string): Promise<void> {
  const provider = new OllamaProvider();
  await assertOllamaReady(provider);
  const config = await loadConfigForPull(provider);

  const families: ModelFamilyId[] =
    familyInput === "all"
      ? [...FAMILY_IDS]
      : [parseModelFamily(familyInput)];

  if (families.length === 0) {
    throw new ValidationError("No model families selected.");
  }

  for (const family of families) {
    const tag = config.families[family].selectedTag;

    logger.heading(`Pulling ${family}`);
    logger.info(`Resolved model: ${tag}`);
    logger.info("Backend: Ollama");
    logger.info("");
    await provider.pullModel(tag);
    logger.info("");
  }

  config.setupCompleted = true;
  await writeConfig(config);
  logger.success("Pull complete.");
}
