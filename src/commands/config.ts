import type { Command } from "commander";
import { logger } from "../utils/logger";
import { readConfig, resetConfig, setDefaultFamily } from "../config/store";

type ShowOptions = {
  json?: boolean;
};

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage local infrctl config");

  config
    .command("show")
    .description("Show current config")
    .option("--json", "print machine-readable JSON")
    .action(async (options: ShowOptions) => {
      const current = await readConfig();

      if (options.json) {
        logger.json(current);
        return;
      }

      logger.info(JSON.stringify(current, null, 2));
    });

  config
    .command("set")
    .description("Set a config value")
    .argument("<key>", "currently supported: default")
    .argument("<value>", "value to set")
    .action(async (key: string, value: string) => {
      if (key !== "default") {
        throw new Error("Only `infrctl config set default <family>` is supported.");
      }

      const next = await setDefaultFamily(value);
      logger.success(`Default model family set to ${next.defaultFamily}.`);
    });

  config
    .command("reset")
    .description("Reset config to defaults")
    .action(async () => {
      await resetConfig();
      logger.success("Config reset.");
    });
}
