import { describe, expect, it } from "vitest";
import {
  FAMILY_IDS,
  MODEL_FAMILIES,
  isModelFamilyId
} from "../src/registry/families";

describe("model registry", () => {
  it("contains exactly the five V1 families", () => {
    expect(FAMILY_IDS).toEqual(["qwen", "deepseek", "llama", "gemma", "phi"]);
    expect(Object.keys(MODEL_FAMILIES).sort()).toEqual([...FAMILY_IDS].sort());
  });

  it("defines at least one valid candidate per family", () => {
    for (const family of FAMILY_IDS) {
      expect(MODEL_FAMILIES[family].candidates.length).toBeGreaterThan(0);

      for (const candidate of MODEL_FAMILIES[family].candidates) {
        expect(candidate.tag).toBeTruthy();
        expect(candidate.label).toBeTruthy();
        expect(candidate.minRamGb).toBeGreaterThan(0);
        expect(candidate.recommendedRamGb).toBeGreaterThan(0);
        expect(candidate.role).toBeTruthy();
      }
    }
  });

  it("rejects unknown family ids", () => {
    expect(isModelFamilyId("qwen")).toBe(true);
    expect(isModelFamilyId("claude")).toBe(false);
  });
});
