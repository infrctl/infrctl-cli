import { describe, expect, it } from "vitest";
import { parseSmithAction } from "../src/agent/actions";

describe("Smith action parsing", () => {
  it("parses fenced JSON actions", () => {
    expect(
      parseSmithAction('```json\n{"action":"respond","message":"done"}\n```')
    ).toEqual({
      action: "respond",
      message: "done"
    });
  });

  it("extracts the first JSON object from extra text", () => {
    expect(
      parseSmithAction('Here:\n{"action":"search","query":"config"}\nThanks')
    ).toEqual({
      action: "search",
      query: "config"
    });
  });

  it("parses plans, unified patches, and test actions", () => {
    expect(parseSmithAction('{"action":"plan","steps":["read","patch"]}')).toEqual({
      action: "plan",
      steps: ["read", "patch"]
    });
    expect(
      parseSmithAction(
        '{"action":"propose_patch","summary":"edit","patch":"diff --git a/a b/a\\n@@\\n"}'
      )
    ).toEqual({
      action: "propose_patch",
      summary: "edit",
      patch: "diff --git a/a b/a\n@@\n"
    });
    expect(parseSmithAction('{"action":"run_tests","scope":"full"}')).toEqual({
      action: "run_tests",
      scope: "full"
    });
  });

  it("rejects unsupported actions", () => {
    expect(() => parseSmithAction('{"action":"delete_file","path":"x"}')).toThrow(
      "unsupported action"
    );
  });
});
