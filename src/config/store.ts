import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FAMILY_IDS,
  type ModelFamilyId,
  parseModelFamily
} from "../registry/families";
import { recommendAll } from "../registry/recommendations";
import { ConfigError } from "../utils/errors";
import { infrctlConfigSchema, type InfrctlConfig } from "./schema";

type JsonObject = Record<string, unknown>;

export type ConfigInspection = {
  path: string;
  exists: boolean;
  valid: boolean;
  config?: InfrctlConfig;
  error?: string;
};

export function getConfigDir(): string {
  return process.env.INFRCTL_CONFIG_DIR ?? path.join(os.homedir(), ".infrctl");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function defaultConfig(totalRamGb?: number): InfrctlConfig {
  const recommendations = recommendAll(totalRamGb);

  return {
    version: 1,
    defaultFamily: "qwen",
    backend: "ollama",
    defaultTemperature: 0.7,
    setupCompleted: false,
    chat: {
      autoSave: true
    },
    serve: {
      host: "127.0.0.1",
      port: 8787
    },
    families: {
      qwen: { selectedTag: recommendations.qwen.selectedTag },
      deepseek: { selectedTag: recommendations.deepseek.selectedTag },
      llama: { selectedTag: recommendations.llama.selectedTag },
      gemma: { selectedTag: recommendations.gemma.selectedTag },
      phi: { selectedTag: recommendations.phi.selectedTag }
    }
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends JsonObject>(base: T, override: unknown): T {
  if (!isObject(override)) {
    return base;
  }

  const next: JsonObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = next[key];

    if (isObject(baseValue) && isObject(value)) {
      next[key] = deepMerge(baseValue, value);
    } else {
      next[key] = value;
    }
  }

  return next as T;
}

async function readRawConfig(): Promise<unknown | null> {
  try {
    const text = await readFile(getConfigPath(), "utf8");
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new ConfigError(`Config file is not valid JSON: ${getConfigPath()}`);
    }

    throw error;
  }
}

export async function readConfig(): Promise<InfrctlConfig> {
  const raw = await readRawConfig();

  if (raw === null) {
    return defaultConfig();
  }

  const merged = deepMerge(defaultConfig() as unknown as JsonObject, raw);
  const parsed = infrctlConfigSchema.safeParse(merged);

  if (!parsed.success) {
    throw new ConfigError(
      `Config file is invalid: ${parsed.error.issues
        .map((issue) => issue.message)
        .join(", ")}`
    );
  }

  return parsed.data;
}

export async function inspectConfig(): Promise<ConfigInspection> {
  const configPath = getConfigPath();
  const raw = await readRawConfig().catch((error: unknown) => {
    return { __readError: error };
  });

  if (raw === null) {
    return {
      path: configPath,
      exists: false,
      valid: true,
      config: defaultConfig()
    };
  }

  if (isObject(raw) && "__readError" in raw) {
    return {
      path: configPath,
      exists: true,
      valid: false,
      error: raw.__readError instanceof Error ? raw.__readError.message : String(raw)
    };
  }

  const merged = deepMerge(defaultConfig() as unknown as JsonObject, raw);
  const parsed = infrctlConfigSchema.safeParse(merged);

  return parsed.success
    ? {
        path: configPath,
        exists: true,
        valid: true,
        config: parsed.data
      }
    : {
        path: configPath,
        exists: true,
        valid: false,
        error: parsed.error.issues.map((issue) => issue.message).join(", ")
      };
}

export async function writeConfig(config: InfrctlConfig): Promise<void> {
  const parsed = infrctlConfigSchema.parse(config);
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getConfigPath(), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function updateConfig(
  updater: (config: InfrctlConfig) => InfrctlConfig
): Promise<InfrctlConfig> {
  const current = await readConfig();
  const next = updater(current);
  await writeConfig(next);
  return next;
}

export async function resetConfig(totalRamGb?: number): Promise<InfrctlConfig> {
  const next = defaultConfig(totalRamGb);
  await writeConfig(next);
  return next;
}

export async function removeConfig(): Promise<void> {
  await rm(getConfigPath(), { force: true });
}

export async function setDefaultFamily(
  family: string
): Promise<InfrctlConfig> {
  const parsedFamily = parseModelFamily(family);

  return await updateConfig((config) => ({
    ...config,
    defaultFamily: parsedFamily
  }));
}

export function configWithRecommendations(totalRamGb?: number): InfrctlConfig {
  return defaultConfig(totalRamGb);
}

export function selectedTagForFamily(
  config: InfrctlConfig,
  family: ModelFamilyId
): string {
  return config.families[family].selectedTag;
}

export function withSelectedTags(
  config: InfrctlConfig,
  selectedTags: Record<ModelFamilyId, string>
): InfrctlConfig {
  return {
    ...config,
    families: Object.fromEntries(
      FAMILY_IDS.map((family) => [
        family,
        { selectedTag: selectedTags[family] }
      ])
    ) as InfrctlConfig["families"]
  };
}
