import type { Command } from "commander";
import { execa } from "execa";
import { VERSION } from "../version";
import { logger } from "../utils/logger";

type UpdateOptions = {
  run?: boolean;
};

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Show how to update infrctl")
    .option("--run", "run npm install -g infrctl@latest")
    .action(async (options: UpdateOptions) => {
      logger.heading("infrctl update");
      logger.info(`Current version: ${VERSION}`);
      logger.info("");

      if (!options.run) {
        logger.info("Update with:");
        logger.info("npm install -g infrctl@latest");
        logger.info("");
        logger.info("Or run:");
        logger.info("infrctl update --run");
        return;
      }

      await execa("npm", ["install", "-g", "infrctl@latest"], {
        stdio: "inherit"
      });
    });
}
