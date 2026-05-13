import { describe, expect, it } from "vitest";
import { FAMILY_IDS, MODEL_FAMILIES } from "../src/registry/families";
import {
  getRecommendationTier,
  recommendAll
} from "../src/registry/recommendations";

describe("recommendations", () => {
  it("picks smaller models for low RAM", () => {
    const recommendations = recommendAll(8);

    expect(getRecommendationTier(8)).toBe("low");
    expect(recommendations.qwen.selectedTag).toBe("qwen3:4b");
    expect(recommendations.deepseek.selectedTag).toBe("deepseek-r1:1.5b");
    expect(recommendations.llama.selectedTag).toBe("llama3.2:3b");
  });

  it("picks medium models for normal RAM", () => {
    const recommendations = recommendAll(16);

    expect(getRecommendationTier(16)).toBe("normal");
    expect(recommendations.qwen.selectedTag).toBe("qwen3:8b");
    expect(recommendations.deepseek.selectedTag).toBe("deepseek-r1:8b");
    expect(recommendations.llama.selectedTag).toBe("llama3.1:8b");
    expect(recommendations.gemma.selectedTag).toBe("gemma3:4b");
  });

  it("picks larger models for strong RAM", () => {
    const recommendations = recommendAll(32);

    expect(getRecommendationTier(32)).toBe("strong");
    expect(recommendations.qwen.selectedTag).toBe("qwen3:14b");
    expect(recommendations.deepseek.selectedTag).toBe("deepseek-r1:14b");
    expect(recommendations.gemma.selectedTag).toBe("gemma3:12b");
  });

  it("never returns unknown families or tags", () => {
    const recommendations = recommendAll(64);

    expect(Object.keys(recommendations).sort()).toEqual([...FAMILY_IDS].sort());

    for (const family of FAMILY_IDS) {
      const tags = MODEL_FAMILIES[family].candidates.map((candidate) => candidate.tag);
      expect(tags).toContain(recommendations[family].selectedTag);
    }
  });
});
