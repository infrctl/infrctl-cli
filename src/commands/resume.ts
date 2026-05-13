import type { Command } from "commander";
import { runChat } from "./chat";

type ResumeOptions = {
  forkSession?: boolean;
  yes?: boolean;
};

export function registerResumeCommand(program: Command): void {
  program
    .command("resume")
    .description("Resume the latest session or a session by id")
    .argument("[sessionId]", "session id or id prefix")
    .option("--fork-session", "resume context into a new session id")
    .option("-y, --yes", "pull missing selected models without prompting")
    .action(async (sessionId: string | undefined, options: ResumeOptions) => {
      await runChat(undefined, {
        resume: sessionId,
        continue: !sessionId,
        forkSession: options.forkSession,
        yes: options.yes
      });
    });
}
