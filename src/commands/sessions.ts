import type { Command } from "commander";
import { listChatSessions } from "../chat/sessions";
import { logger } from "../utils/logger";

type SessionsOptions = {
  json?: boolean;
};

export function registerSessionsCommand(program: Command): void {
  program
    .command("sessions")
    .description("List saved infrctl chat sessions")
    .option("--json", "print machine-readable JSON")
    .action(async (options: SessionsOptions) => {
      const sessions = await listChatSessions();

      if (options.json) {
        logger.json(sessions);
        return;
      }

      logger.heading("infrctl sessions");

      if (sessions.length === 0) {
        logger.info("");
        logger.info("No sessions yet. Start one with `infrctl`.");
        return;
      }

      for (const session of sessions.slice(0, 20)) {
        logger.info("");
        logger.heading(session.id);
        logger.info(`  Family: ${session.family}`);
        logger.info(`  Backend model: ${session.backendModel}`);
        logger.info(`  Messages: ${session.messages.length}`);
        logger.info(`  Updated: ${session.updatedAt}`);
        logger.info(`  Resume: infrctl --resume ${session.id}`);
      }
    });
}
