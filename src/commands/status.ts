import type { Command } from "commander";
import { readConfig } from "../config/store";
import { OllamaProvider } from "../providers/ollama";
import { getModelStatuses } from "../models/status";
import { logger } from "../utils/logger";

type StatusOptions = {
  json?: boolean;
};

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show a short infrctl environment summary")
    .option("--json", "print machine-readable JSON")
    .action(async (options: StatusOptions) => {
      await runStatus(options);
    });
}

async function runStatus(options: StatusOptions): Promise<void> {
  const config = await readConfig();
  const provider = new OllamaProvider();
  const [ollamaInstalled, ollamaRunning, statuses] = await Promise.all([
    provider.isInstalled(),
    provider.isRunning(),
    getModelStatuses(config, provider)
  ]);
  const installed = statuses.filter((status) => status.installed);
  const missing = statuses.filter((status) => !status.installed);

  const report = {
    ollama: {
      installed: ollamaInstalled,
      running: ollamaRunning
    },
    defaultFamily: config.defaultFamily,
    defaultModel: config.families[config.defaultFamily].selectedTag,
    autoSave: config.chat.autoSave,
    installed: installed.map((status) => status.family),
    missing: missing.map((status) => status.family),
    next:
      missing.length > 0
        ? `infrctl pull ${missing[0]!.family}`
        : `infrctl chat ${config.defaultFamily}`
  };

  if (options.json) {
    logger.json(report);
    return;
  }

  logger.heading("infrctl status");
  logger.info("");
  logger.info(`Ollama: ${ollamaRunning ? "running" : ollamaInstalled ? "installed, not running" : "not installed"}`);
  logger.info(`Default: ${config.defaultFamily} -> ${report.defaultModel}`);
  logger.info(`Chat autosave: ${config.chat.autoSave ? "on" : "off"}`);
  logger.info(
    `Installed: ${installed.length > 0 ? installed.map((item) => item.family).join(", ") : "none"}`
  );
  logger.info(
    `Missing: ${missing.length > 0 ? missing.map((item) => item.family).join(", ") : "none"}`
  );
  logger.info("");
  logger.heading("Next");
  logger.info(report.next);
}
