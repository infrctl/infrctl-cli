export class InfrctlError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "InfrctlError";
    this.exitCode = exitCode;
  }
}

export class ConfigError extends InfrctlError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class OllamaError extends InfrctlError {
  constructor(message: string) {
    super(message);
    this.name = "OllamaError";
  }
}

export class ValidationError extends InfrctlError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function normalizeCliError(error: unknown): InfrctlError {
  if (error instanceof InfrctlError) {
    return error;
  }

  return new InfrctlError(toErrorMessage(error));
}

export const OLLAMA_MISSING_MESSAGE = `Ollama is not installed.

Run setup to install and configure it:
infrctl setup

infrctl can install Ollama automatically on Linux and macOS.

Or install Ollama manually from:
https://ollama.com/download

Then run:
infrctl setup`;

export const OLLAMA_NOT_RUNNING_MESSAGE = `Ollama is installed but not running.

Start it with:
ollama serve

Then run:
infrctl doctor`;
