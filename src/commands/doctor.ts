import type { Command } from "commander";
import { detectHardware } from "../hardware/detect";
import { recommendForHardware } from "../hardware/recommend";
import { FAMILY_IDS } from "../registry/families";
import { inspectConfig, readConfig } from "../config/store";
import { OllamaProvider } from "../providers/ollama";
import { logger } from "../utils/logger";
import { formatGb } from "../utils/format";
import { isPortAvailable } from "../utils/shell";

type DoctorOptions = {
  json?: boolean;
};

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Debug local infrctl and Ollama environment")
    .option("--json", "print machine-readable JSON")
    .action(async (options: DoctorOptions) => {
      await runDoctor(options);
    });
}

async function runDoctor(options: DoctorOptions): Promise<void> {
  const provider = new OllamaProvider();
  const hardware = await detectHardware(provider);
  const configInspection = await inspectConfig();
  const config = configInspection.config ?? (await readConfig().catch(() => null));
  const installedModels = hardware.ollama.running
    ? await provider.listModels().catch(() => [])
    : [];
  const recommendations = recommendForHardware(hardware);
  const servePort = config?.serve.port ?? 8787;
  const serveHost = config?.serve.host ?? "127.0.0.1";
  const portAvailable = await isPortAvailable(serveHost, servePort);

  const report = {
    node: process.version,
    system: hardware,
    backend: {
      ollamaInstalled: hardware.ollama.installed,
      ollamaRunning: hardware.ollama.running,
      ollamaApi: hardware.ollama.running ? "healthy" : "unreachable"
    },
    config: configInspection,
    installedModels,
    selectedModels: config?.families,
    recommended: recommendations,
    serve: {
      host: serveHost,
      port: servePort,
      portAvailable
    }
  };

  if (options.json) {
    logger.json(report);
    return;
  }

  logger.heading("infrctl doctor");
  logger.info("");
  logger.heading("System");
  logger.info(`OS: ${hardware.os.distro ?? hardware.os.platform} ${hardware.os.arch}`);
  logger.info(`RAM: ${formatGb(hardware.memory.totalGb)}`);
  logger.info(
    `CPU: ${[hardware.cpu?.manufacturer, hardware.cpu?.brand].filter(Boolean).join(" ") || "unknown"}`
  );

  if (hardware.gpu.controllers.length > 0) {
    for (const gpu of hardware.gpu.controllers) {
      logger.info(
        `GPU: ${[gpu.vendor, gpu.model].filter(Boolean).join(" ") || "unknown"}${
          gpu.vramGb ? ` (${formatGb(gpu.vramGb)} VRAM)` : ""
        }`
      );
    }
  } else {
    logger.info("GPU: unknown");
  }

  logger.info("");
  logger.heading("Backend");
  logger.info(`Ollama: ${hardware.ollama.installed ? "installed" : "not installed"}`);
  logger.info(`Ollama server: ${hardware.ollama.running ? "running" : "not running"}`);
  logger.info(`Ollama API: ${hardware.ollama.running ? "healthy" : "unreachable"}`);

  logger.info("");
  logger.heading("Config");
  logger.info(`Path: ${configInspection.path}`);
  logger.info(`Status: ${configInspection.valid ? "valid" : "invalid"}`);
  if (configInspection.error) {
    logger.info(`Error: ${configInspection.error}`);
  }

  logger.info("");
  logger.heading("Installed models");
  for (const family of FAMILY_IDS) {
    const tag = config?.families[family].selectedTag ?? recommendations[family].selectedTag;
    logger.info(
      `${family}: ${installedModels.includes(tag) ? `${tag} installed` : "not installed"}`
    );
  }

  logger.info("");
  logger.heading("Recommended");
  logger.info("This machine can comfortably run:");
  for (const family of FAMILY_IDS) {
    logger.info(`- ${family} (${recommendations[family].selectedTag})`);
  }

  logger.info("");
  logger.heading("Serve");
  logger.info(
    `Port ${servePort}: ${portAvailable ? "available" : "already in use"}`
  );
}
