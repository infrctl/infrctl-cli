import { describe, expect, it } from "vitest";
import { hasInstalledTag, modelTagMatches } from "../src/models/tags";

describe("model tag matching", () => {
  it("treats bare tags and latest tags as equivalent", () => {
    expect(modelTagMatches("phi4-mini", "phi4-mini:latest")).toBe(true);
    expect(modelTagMatches("phi4-mini:latest", "phi4-mini")).toBe(true);
    expect(modelTagMatches("qwen3:8b", "qwen3:8b")).toBe(true);
  });

  it("checks installed tag lists", () => {
    expect(hasInstalledTag(["phi4-mini:latest"], "phi4-mini")).toBe(true);
    expect(hasInstalledTag(["qwen3:8b"], "phi4-mini")).toBe(false);
  });
});
