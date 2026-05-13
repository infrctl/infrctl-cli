import type { Command } from "commander";
import { readConfig } from "../config/store";
import { OllamaProvider } from "../providers/ollama";
import { logger } from "../utils/logger";
import { getModelStatuses } from "../models/status";
import { sentenceList } from "../utils/format";

type ModelsOptions = {
  json?: boolean;
  installed?: boolean;
};

export function registerModelsCommand(program: Command): void {
  program
    .command("models")
    .description("List supported model families and local status")
    .option("--json", "print machine-readable JSON")
    .option("--installed", "show only installed model families")
    .action(async (options: ModelsOptions) => {
      await runModels(options);
    });
}

async function runModels(options: ModelsOptions): Promise<void> {
  const config = await readConfig();
  const provider = new OllamaProvider();
  const statuses = (await getModelStatuses(config, provider)).filter(
    (status) => !options.installed || status.installed
  );

  if (options.json) {
    logger.json(statuses);
    return;
  }

  logger.heading("Available model families");

  for (const status of statuses) {
    logger.info("");
    logger.heading(status.family);
    logger.info(`  Role: ${status.role}`);
    logger.info(`  Best for: ${sentenceList(status.bestFor)}`);
    logger.info(`  Selected: ${status.selectedTag}`);
    logger.info(`  Suggested: ${status.recommendedTag}`);
    logger.info(
      `  Fit: ${status.recommendedForMachine ? "recommended for this machine" : "custom selection"}`
    );
    logger.info(`  Status: ${status.installed ? "installed" : "not installed"}`);
    logger.info(
      `  Sizes: ${status.candidates
        .map((candidate) => `${candidate.tag} (${candidate.recommendedRamGb} GB RAM)`)
        .join(", ")}`
    );
    logger.info(`  Command: ${status.command}`);
  }
}
