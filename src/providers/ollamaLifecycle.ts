import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { confirm } from "@inquirer/prompts";
import {
  OLLAMA_MISSING_MESSAGE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  OllamaError
} from "../utils/errors";
import { logger as defaultLogger } from "../utils/logger";
import type { OllamaProviderLike } from "./ollama";

type LifecycleLogger = Pick<typeof defaultLogger, "info" | "warn" | "success">;

export type StartOllamaOptions = {
  timeoutMs?: number;
};

export type EnsureOllamaReadyForSetupOptions = {
  yes?: boolean;
  interactive?: boolean;
  installOllama?: boolean;
  startOllamaFn?: (provider: OllamaProviderLike) => Promise<boolean>;
  confirmInstall?: () => Promise<boolean>;
  logger?: LifecycleLogger;
};

export async function waitForOllama(
  provider: OllamaProviderLike,
  timeoutMs = 12_000
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await provider.isRunning()) {
      return true;
    }

    await sleep(500);
  }

  return provider.isRunning();
}

export async function startOllama(
  provider: OllamaProviderLike,
  options: StartOllamaOptions = {}
): Promise<boolean> {
  if (await provider.isRunning()) {
    return true;
  }

  if (!(await provider.isInstalled())) {
    throw new OllamaError(OLLAMA_MISSING_MESSAGE);
  }

  try {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore"
    });

    child.on("error", () => undefined);
    child.unref();
  } catch {
    return false;
  }

  return waitForOllama(provider, options.timeoutMs);
}

export async function ensureOllamaReadyForSetup(
  provider: OllamaProviderLike,
  options: EnsureOllamaReadyForSetupOptions = {}
): Promise<void> {
  const log = options.logger ?? defaultLogger;
  const startFn = options.startOllamaFn ?? ((readyProvider) => startOllama(readyProvider));

  if (!(await provider.isInstalled())) {
    if (options.installOllama === false) {
      throw new OllamaError(OLLAMA_MISSING_MESSAGE);
    }

    const shouldShowInstallHelp =
      options.yes ||
      !options.interactive ||
      (await (options.confirmInstall ??
        (() =>
          confirm({
            message: "Ollama is required. Show install instructions?",
            default: true
          })))());

    if (!shouldShowInstallHelp) {
      throw new OllamaError(OLLAMA_MISSING_MESSAGE);
    }

    log.info("");
    throw new OllamaError(OLLAMA_MISSING_MESSAGE);
  }

  if (await provider.isRunning()) {
    return;
  }

  log.info("");
  log.info("Starting Ollama...");

  if (await startFn(provider)) {
    log.success("Ollama API reachable");
    return;
  }

  throw new OllamaError(OLLAMA_NOT_RUNNING_MESSAGE);
}
