import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { execa } from "execa";
import { confirm } from "@inquirer/prompts";
import {
  OLLAMA_MISSING_MESSAGE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  OllamaError,
  toErrorMessage
} from "../utils/errors";
import { logger as defaultLogger } from "../utils/logger";
import type { OllamaProviderLike } from "./ollama";

export const OLLAMA_INSTALL_SCRIPT_URL = "https://ollama.com/install.sh";

type StdioMode = "inherit" | "pipe";

type CommandRunner = (
  file: string,
  args: string[],
  options: { stdio: StdioMode }
) => Promise<unknown>;

type LifecycleLogger = Pick<typeof defaultLogger, "info" | "warn" | "success">;

export type InstallOllamaOptions = {
  platform?: NodeJS.Platform;
  installUrl?: string;
  stdio?: StdioMode;
  run?: CommandRunner;
};

export type StartOllamaOptions = {
  timeoutMs?: number;
};

export type EnsureOllamaReadyForSetupOptions = {
  yes?: boolean;
  interactive?: boolean;
  installOllama?: boolean;
  installOllamaFn?: () => Promise<void>;
  startOllamaFn?: (provider: OllamaProviderLike) => Promise<boolean>;
  confirmInstall?: () => Promise<boolean>;
  logger?: LifecycleLogger;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function supportsManagedOllamaInstall(
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === "linux" || platform === "darwin";
}

export function getOllamaInstallScriptUrl(): string {
  return process.env.INFRCTL_OLLAMA_INSTALL_URL ?? OLLAMA_INSTALL_SCRIPT_URL;
}

export function getOllamaInstallCommand(
  installUrl = getOllamaInstallScriptUrl()
): string {
  return `curl -fsSL ${shellQuote(installUrl)} | sh`;
}

export async function installOllama(
  options: InstallOllamaOptions = {}
): Promise<void> {
  const platform = options.platform ?? process.platform;

  if (!supportsManagedOllamaInstall(platform)) {
    throw new OllamaError(`Automatic Ollama install is supported on Linux and macOS.

Install Ollama manually from:
https://ollama.com/download

Then run:
infrctl setup`);
  }

  const run =
    options.run ??
    (async (file: string, args: string[], runOptions: { stdio: StdioMode }) => {
      await execa(file, args, runOptions);
    });
  const command = getOllamaInstallCommand(options.installUrl);

  try {
    await run("sh", ["-c", command], {
      stdio: options.stdio ?? "inherit"
    });
  } catch (error) {
    throw new OllamaError(`Could not install Ollama automatically.

${toErrorMessage(error)}

You can still install Ollama manually from:
https://ollama.com/download

Then run:
infrctl setup`);
  }
}

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
  const installFn = options.installOllamaFn ?? (() => installOllama());
  const startFn = options.startOllamaFn ?? ((readyProvider) => startOllama(readyProvider));

  if (!(await provider.isInstalled())) {
    if (options.installOllama === false) {
      throw new OllamaError(OLLAMA_MISSING_MESSAGE);
    }

    const shouldInstall =
      options.yes ||
      !options.interactive ||
      (await (options.confirmInstall ??
        (() =>
          confirm({
            message: "Ollama is required. Install it now?",
            default: true
          })))());

    if (!shouldInstall) {
      throw new OllamaError(OLLAMA_MISSING_MESSAGE);
    }

    log.info("");
    log.info("Installing Ollama from the official Ollama installer...");
    await installFn();

    if (!(await provider.isInstalled())) {
      throw new OllamaError(`Ollama install finished, but the ollama command was not found.

Open a new terminal, then run:
infrctl setup

If that still fails, install Ollama manually from:
https://ollama.com/download`);
    }

    log.success("Ollama installed");
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
