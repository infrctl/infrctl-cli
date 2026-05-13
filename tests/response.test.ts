import { describe, expect, it } from "vitest";
import { stripThinkingBlocks } from "../src/utils/response";

describe("response cleanup", () => {
  it("removes model thinking blocks", () => {
    expect(
      stripThinkingBlocks("<think>\nprivate reasoning\n</think>\n\ninfrctl")
    ).toBe("infrctl");
  });

  it("leaves normal text alone", () => {
    expect(stripThinkingBlocks("hello infrctl")).toBe("hello infrctl");
  });
});
