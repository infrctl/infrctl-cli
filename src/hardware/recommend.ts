import type { HardwareInfo } from "./detect";
import { recommendAll } from "../registry/recommendations";

export function recommendForHardware(info: HardwareInfo) {
  return recommendAll(info.memory.totalGb);
}
