import { checkbox, confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import ora from "ora";
import {
  FAMILY_IDS,
  MODEL_FAMILIES,
  type ModelFamilyId
} from "../registry/families";
import { recommendForHardware } from "../hardware/recommend";
import { detectHardware } from "../hardware/detect";
import { OllamaProvider } from "../providers/ollama";
import { ensureOllamaReadyForSetup } from "../providers/ollamaLifecycle";
import { defaultConfig, writeConfig } from "../config/store";
import { logger } from "../utils/logger";
import { formatGb, pad } from "../utils/format";
import { parseFamilyList } from "../utils/validation";

type SetupOptions = {
  yes?: boolean;
  only?: string;
  starter?: boolean;
  installOllama?: boolean;
};

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Prepare this machine to run local AI models")
    .option("-y, --yes", "install all recommended models without prompts")
    .option("--only <families>", "only install selected families, comma-separated")
    .option("--starter", "install a lighter starter set: phi and qwen")
    .option("--no-install-ollama", "reserved for standalone installs; npm setup never installs Ollama automatically")
    .action(async (options: SetupOptions) => {
      await runSetup(options);
    });
}

async function chooseFamilies(
  candidates: ModelFamilyId[],
  options: SetupOptions
): Promise<ModelFamilyId[]> {
  if (options.yes || !isInteractive()) {
    return candidates;
  }

  const installRecommended = await confirm({
    message: "Install recommended models?",
    default: true
  });

  if (installRecommended) {
    return candidates;
  }

  const selected = await checkbox<ModelFamilyId>({
    message: "Choose model families to install",
    choices: candidates.map((family) => ({
      name: MODEL_FAMILIES[family].displayName,
      value: family,
      checked: family === "qwen" || family === "phi"
    }))
  });

  return selected;
}

async function runSetup(options: SetupOptions): Promise<void> {
  logger.heading("Welcome to infrctl.");
  logger.info("");
  logger.info("infrctl runs local AI models from your terminal.");
  logger.info("");

  const provider = new OllamaProvider();
  const spinner = ora("Checking system...").start();
  const hardware = await detectHardware(provider);
  spinner.stop();

  logger.success(
    `OS detected: ${hardware.os.distro ?? hardware.os.platform} ${hardware.os.arch}`
  );
  logger.success(`RAM detected: ${formatGb(hardware.memory.totalGb)}`);

  if (hardware.ollama.installed) {
    logger.success("Ollama installed");
  } else {
    logger.warn("Ollama was not found.");
  }

  if (hardware.ollama.running) {
    logger.success("Ollama API reachable");
  } else {
    logger.warn("Ollama API is not reachable");
  }

  const selectedFamilies = options.only
    ? parseFamilyList(options.only)
    : options.starter
      ? (["phi", "qwen"] satisfies ModelFamilyId[])
    : [...FAMILY_IDS];
  const recommendations = recommendForHardware(hardware);

  logger.info("");
  logger.heading(
    options.starter
      ? "Starter models for this machine:"
      : "Recommended models for this machine:"
  );

  for (const family of selectedFamilies) {
    logger.info(
      `- ${pad(family, 9)} -> ${recommendations[family].selectedTag}`
    );
  }

  await ensureOllamaReadyForSetup(provider, {
    yes: options.yes,
    interactive: isInteractive(),
    installOllama: options.installOllama,
    logger
  });

  const familiesToInstall = await chooseFamilies(selectedFamilies, options);
  const nextConfig = defaultConfig(hardware.memory.totalGb);
  nextConfig.setupCompleted = true;

  for (const family of FAMILY_IDS) {
    nextConfig.families[family].selectedTag =
      recommendations[family].selectedTag;
  }

  for (const family of familiesToInstall) {
    logger.info("");
    logger.heading(`Pulling ${family}`);
    logger.info(`Resolved model: ${nextConfig.families[family].selectedTag}`);
    logger.info("Backend: Ollama");
    await provider.pullModel(nextConfig.families[family].selectedTag);
  }

  await writeConfig(nextConfig);

  logger.info("");
  logger.success(
    options.starter
      ? "Starter setup complete. Add more later with `infrctl pull <family>`."
      : "Setup complete."
  );
}
