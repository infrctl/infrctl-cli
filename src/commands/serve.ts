import type { Command } from "commander";
import { parseModelFamily } from "../registry/families";
import { readConfig } from "../config/store";
import { createServer } from "../server/createServer";
import { logger } from "../utils/logger";
import { InfrctlError } from "../utils/errors";
import { ensureFamilyInstalled } from "../models/ensureInstalled";
import { OllamaProvider, assertOllamaReady } from "../providers/ollama";
import { findAvailablePort } from "../utils/ports";

type ServeOptions = {
  host?: string;
  port?: string;
  autoPort?: boolean;
  yes?: boolean;
};

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start a local OpenAI-compatible API server")
    .argument("[family]", "default model family for this server")
    .option("--host <host>", "host to bind")
    .option("--port <port>", "port to bind")
    .option("--auto-port", "use the next available port when the requested port is busy")
    .option("-y, --yes", "pull the selected model without prompting if it is missing")
    .action(async (familyInput: string | undefined, options: ServeOptions) => {
      await runServe(familyInput, options);
    });
}

async function runServe(
  familyInput: string | undefined,
  options: ServeOptions
): Promise<void> {
  const config = await readConfig();

  if (familyInput) {
    config.defaultFamily = parseModelFamily(familyInput);
  }

  const host = options.host ?? config.serve.host;
  let port = options.port ? Number(options.port) : config.serve.port;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }

  if (host === "0.0.0.0") {
    logger.warn(`Warning: You are exposing infrctl beyond localhost.
Only do this on trusted networks.`);
  }

  const provider = new OllamaProvider();
  await assertOllamaReady(provider);
  await ensureFamilyInstalled(config, provider, config.defaultFamily, {
    yes: options.yes
  });

  if (options.autoPort) {
    const availablePort = await findAvailablePort(host, port);
    if (availablePort !== port) {
      logger.warn(`Port ${port} is busy. Using ${availablePort} instead.`);
      port = availablePort;
    }
  }

  const app = createServer({ config });
  try {
    await app.listen({ host, port });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      throw new InfrctlError(`Port ${port} is already in use on ${host}.

Try another port:
infrctl serve ${config.defaultFamily} --port ${port + 1}

Or stop the process currently using port ${port}.`);
    }

    throw error;
  }

  logger.success(`infrctl serve listening on http://${host}:${port}`);
  logger.info(`Default family: ${config.defaultFamily}`);
  logger.info("Endpoint: /v1/chat/completions");
}
