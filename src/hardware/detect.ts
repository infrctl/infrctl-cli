import os from "node:os";
import si from "systeminformation";
import { OllamaProvider, type OllamaProviderLike } from "../providers/ollama";

export type HardwareInfo = {
  os: {
    platform: string;
    arch: string;
    distro?: string;
    release?: string;
  };
  cpu?: {
    manufacturer?: string;
    brand?: string;
    cores?: number;
  };
  memory: {
    totalGb?: number;
    freeGb?: number;
  };
  gpu: {
    controllers: Array<{
      vendor?: string;
      model?: string;
      vramGb?: number;
    }>;
    hasNvidia: boolean;
  };
  ollama: {
    installed: boolean;
    running: boolean;
  };
};

function bytesToGb(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Math.round((value / 1024 / 1024 / 1024) * 10) / 10;
}

function mbToGb(value?: number): number | undefined {
  if (value === undefined || value <= 0) {
    return undefined;
  }

  return Math.round((value / 1024) * 10) / 10;
}

export async function detectHardware(
  provider: OllamaProviderLike = new OllamaProvider()
): Promise<HardwareInfo> {
  const [osInfoResult, cpuResult, memResult, graphicsResult] =
    await Promise.allSettled([si.osInfo(), si.cpu(), si.mem(), si.graphics()]);

  const osInfo = osInfoResult.status === "fulfilled" ? osInfoResult.value : null;
  const cpu = cpuResult.status === "fulfilled" ? cpuResult.value : null;
  const mem = memResult.status === "fulfilled" ? memResult.value : null;
  const graphics =
    graphicsResult.status === "fulfilled" ? graphicsResult.value : null;

  const controllers =
    graphics?.controllers.map((controller) => ({
      vendor: controller.vendor,
      model: controller.model,
      vramGb: mbToGb(controller.vram)
    })) ?? [];

  const [installed, running] = await Promise.all([
    provider.isInstalled().catch(() => false),
    provider.isRunning().catch(() => false)
  ]);

  return {
    os: {
      platform: osInfo?.platform ?? os.platform(),
      arch: osInfo?.arch ?? os.arch(),
      distro: osInfo?.distro,
      release: osInfo?.release
    },
    cpu: cpu
      ? {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          cores: cpu.cores
        }
      : undefined,
    memory: {
      totalGb: bytesToGb(mem?.total),
      freeGb: bytesToGb(mem?.available ?? mem?.free)
    },
    gpu: {
      controllers,
      hasNvidia: controllers.some((controller) =>
        `${controller.vendor ?? ""} ${controller.model ?? ""}`
          .toLowerCase()
          .includes("nvidia")
      )
    },
    ollama: {
      installed,
      running
    }
  };
}
