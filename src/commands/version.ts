import type { Command } from "commander";
import { VERSION } from "../version";

export function registerVersionCommand(program: Command): void {
  program
    .command("version")
    .description("Print infrctl version")
    .action(() => {
      console.log(VERSION);
    });
}
