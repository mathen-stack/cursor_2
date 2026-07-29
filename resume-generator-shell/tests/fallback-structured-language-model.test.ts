import { describe, expect, it } from "vitest";
import {
  FallbackStructuredLanguageModel,
  isModelBillingError,
  type StructuredLanguageModel,
} from "@resume/engines";

function model(
  name: string,
  impl: StructuredLanguageModel["generateStructured"],
): StructuredLanguageModel {
  return { name, generateStructured: impl };
}

describe("FallbackStructuredLanguageModel", () => {
  it("detects OpenRouter credit errors", () => {
    expect(
      isModelBillingError(
        new Error(
          'Model provider returned HTTP 402: {"error":{"message":"Insufficient credits."}}',
        ),
      ),
    ).toBe(true);
    expect(isModelBillingError(new Error("HTTP 500 boom"))).toBe(false);
  });

  it("falls back to the rule-based model on HTTP 402", async () => {
    const primary = model("primary", async () => {
      throw new Error(
        'Model provider returned HTTP 402: {"error":{"message":"Insufficient credits."}}',
      );
    });
    const fallback = model("fallback", async () => ({ value: "rule-based" }));
    const wrapped = new FallbackStructuredLanguageModel(primary, fallback);
    await expect(
      wrapped.generateStructured({
        task: "extract",
        systemPrompt: "Return JSON.",
        input: {},
        jsonSchema: { type: "object" },
      }),
    ).resolves.toEqual({ value: "rule-based" });
  });

  it("rethrows non-billing errors", async () => {
    const primary = model("primary", async () => {
      throw new Error("Model provider returned HTTP 500: boom");
    });
    const fallback = model("fallback", async () => ({ value: "unused" }));
    const wrapped = new FallbackStructuredLanguageModel(primary, fallback);
    await expect(
      wrapped.generateStructured({
        task: "extract",
        systemPrompt: "Return JSON.",
        input: {},
        jsonSchema: { type: "object" },
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
