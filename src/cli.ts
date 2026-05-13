import { Command } from "commander";
import { registerAskCommand, runAsk } from "./commands/ask";
import { registerChatCommand, runChat } from "./commands/chat";
import { registerCompletionCommand } from "./commands/completion";
import { registerConfigCommand } from "./commands/config";
import { registerDoctorCommand } from "./commands/doctor";
import { registerModelsCommand } from "./commands/models";
import { registerPullCommand } from "./commands/pull";
import { registerResumeCommand } from "./commands/resume";
import { registerServeCommand } from "./commands/serve";
import { registerSessionsCommand } from "./commands/sessions";
import { registerSetupCommand } from "./commands/setup";
import { registerStatusCommand } from "./commands/status";
import { registerUpdateCommand } from "./commands/update";
import { registerVersionCommand } from "./commands/version";
import { isModelFamilyId } from "./registry/families";
import { VERSION } from "./version";
import { logger } from "./utils/logger";
import { normalizeCliError, ValidationError } from "./utils/errors";

type RootOptions = {
  print?: boolean;
  model?: string;
  continue?: boolean;
  resume?: string;
  forkSession?: boolean;
  outputFormat?: string;
  yes?: boolean;
};

export async function run(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("infrctl")
    .description("Five local AI model families. One CLI.")
    .version(VERSION)
    .argument("[prompt...]", "prompt for print mode, or optional family for interactive mode")
    .option("-p, --print", "print a response and exit")
    .option("-m, --model <family>", "model family to use")
    .option("-c, --continue", "resume the latest chat session")
    .option("-r, --resume <sessionId>", "resume a chat session by id or id prefix")
    .option("--fork-session", "resume context into a new session id")
    .option("--output-format <format>", "text or json for print mode")
    .option("-y, --yes", "pull missing selected models without prompting")
    .action(async (prompt: string[], options: RootOptions) => {
      if (options.print) {
        await runAsk(prompt, {
          model: options.model,
          continue: options.continue,
          resume: options.resume,
          forkSession: options.forkSession,
          outputFormat: options.outputFormat,
          yes: options.yes
        });
        return;
      }

      if (prompt.length > 1 || (prompt[0] && !isModelFamilyId(prompt[0]))) {
        throw new ValidationError(`Unknown command or model family: ${prompt.join(" ")}

For one-shot prompts, use:
infrctl -p "${prompt.join(" ")}"

For interactive chat, use:
infrctl
infrctl qwen`);
      }

      await runChat(options.model ?? prompt[0], {
        continue: options.continue,
        resume: options.resume,
        forkSession: options.forkSession,
        yes: options.yes
      });
    });

  registerSetupCommand(program);
  registerModelsCommand(program);
  registerPullCommand(program);
  registerChatCommand(program);
  registerAskCommand(program);
  registerServeCommand(program);
  registerDoctorCommand(program);
  registerStatusCommand(program);
  registerSessionsCommand(program);
  registerResumeCommand(program);
  registerConfigCommand(program);
  registerCompletionCommand(program);
  registerUpdateCommand(program);
  registerVersionCommand(program);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const normalized = normalizeCliError(error);
    logger.error(normalized.message);
    process.exitCode = normalized.exitCode;
  }
}
