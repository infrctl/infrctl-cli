import { execa } from "execa";
import {
  OLLAMA_MISSING_MESSAGE,
  OLLAMA_NOT_RUNNING_MESSAGE,
  OllamaError
} from "../utils/errors";
import { stripThinkingBlocks } from "../utils/response";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateOptions = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
};

export interface OllamaProviderLike {
  isInstalled(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  listModels(): Promise<string[]>;
  pullModel(tag: string): Promise<void>;
  chat(options: GenerateOptions): Promise<string>;
}

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
};

type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
  };
  response?: string;
  error?: string;
};

function ollamaTimeoutMs(): number {
  const raw = process.env.INFRCTL_OLLAMA_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 120_000;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

export class OllamaProvider implements OllamaProviderLike {
  readonly baseUrl: string;

  constructor(baseUrl = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async isInstalled(): Promise<boolean> {
    try {
      const result = await execa("ollama", ["--version"], { reject: false });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    const response = await this.fetchOllama(`${this.baseUrl}/api/tags`, {
      method: "GET"
    });

    const data = (await response.json()) as OllamaTagsResponse;

    return (data.models ?? [])
      .map((model) => model.name ?? model.model)
      .filter((name): name is string => Boolean(name));
  }

  async pullModel(tag: string): Promise<void> {
    const installed = await this.isInstalled();

    if (!installed) {
      throw new OllamaError(OLLAMA_MISSING_MESSAGE);
    }

    try {
      await execa("ollama", ["pull", tag], {
        stdio: "inherit"
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new OllamaError(`Could not pull ${tag} with Ollama.

${error.message}`);
      }

      throw error;
    }
  }

  async chat(options: GenerateOptions): Promise<string> {
    if (options.stream) {
      throw new OllamaError("Streaming is not supported by this provider call.");
    }

    const response = await this.fetchOllama(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature
        }
      })
    });

    const data = (await response.json()) as OllamaChatResponse;

    if (data.error) {
      throw new OllamaError(data.error);
    }

    const content = data.message?.content ?? data.response;

    if (!content) {
      throw new OllamaError("Ollama returned an empty response.");
    }

    return stripThinkingBlocks(content);
  }

  private async fetchOllama(
    input: string,
    init: RequestInit
  ): Promise<Response> {
    let response: Response;
    const timeoutMs = ollamaTimeoutMs();

    try {
      response = await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new OllamaError(`Ollama did not respond within ${Math.round(
          timeoutMs / 1000
        )} seconds.

The model may still be loading or generating on CPU.

Try a smaller model:
infrctl smith --model phi "your task"

Or increase the timeout:
INFRCTL_OLLAMA_TIMEOUT_MS=180000 infrctl smith "your task"`);
      }

      throw new OllamaError(`Could not connect to Ollama at ${this.baseUrl}.

Ollama may not be running.

Try:
ollama serve

Then run:
infrctl doctor`);
    }

    if (response.ok) {
      return response;
    }

    const body = await response.text().catch(() => "");
    let message = body;

    try {
      const parsed = JSON.parse(body) as { error?: string };
      message = parsed.error ?? body;
    } catch {
      // Leave the plain text body as-is.
    }

    if (response.status === 404) {
      throw new OllamaError(`Model was not found by Ollama.

${message}

Install the model with:
infrctl pull <family>`);
    }

    if (response.status >= 500) {
      throw new OllamaError(`Ollama returned an error.

${message || `HTTP ${response.status}`}`);
    }

    throw new OllamaError(message || `Ollama request failed: HTTP ${response.status}`);
  }
}

export async function assertOllamaReady(
  provider: OllamaProviderLike
): Promise<void> {
  if (!(await provider.isInstalled())) {
    throw new OllamaError(OLLAMA_MISSING_MESSAGE);
  }

  if (!(await provider.isRunning())) {
    throw new OllamaError(OLLAMA_NOT_RUNNING_MESSAGE);
  }
}
