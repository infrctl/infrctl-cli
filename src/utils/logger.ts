import chalk from "chalk";

export const logger = {
  heading(message: string): void {
    console.log(chalk.bold(message));
  },

  info(message: string): void {
    console.log(message);
  },

  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  },

  warn(message: string): void {
    console.warn(chalk.yellow(message));
  },

  error(message: string): void {
    console.error(chalk.red(message));
  },

  json(value: unknown): void {
    console.log(JSON.stringify(value, null, 2));
  }
};
