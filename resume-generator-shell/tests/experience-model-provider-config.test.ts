import { describe, expect, it } from "vitest";
import { loadExperienceModelProviderConfig } from "@resume/engines";

describe("loadExperienceModelProviderConfig", () => {
  it("defaults to OpenRouter AI when an API key is present", () => {
    const config = loadExperienceModelProviderConfig({
      EXPERIENCE_MODEL_API_KEY: "sk-or-test",
    });
    expect(config.provider).toBe("openai-compatible");
    expect(config.providerName).toBe("openrouter");
    expect(config.model).toBe("openai/gpt-4o-mini");
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.apiKey).toBe("sk-or-test");
  });

  it("accepts OPENROUTER_API_KEY as an alias", () => {
    const config = loadExperienceModelProviderConfig({
      OPENROUTER_API_KEY: "sk-or-alias",
      EXPERIENCE_MODEL_NAME: "anthropic/claude-3.5-sonnet",
    });
    expect(config.provider).toBe("openai-compatible");
    expect(config.apiKey).toBe("sk-or-alias");
    expect(config.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("falls back to rule-based when no API key is configured", () => {
    const config = loadExperienceModelProviderConfig({
      EXPERIENCE_MODEL_PROVIDER: "openai-compatible",
    });
    expect(config).toEqual({ provider: "rule-based" });
  });

  it("forces rule-based when explicitly requested", () => {
    const config = loadExperienceModelProviderConfig({
      EXPERIENCE_MODEL_PROVIDER: "rule-based",
      EXPERIENCE_MODEL_API_KEY: "sk-or-ignored",
    });
    expect(config).toEqual({ provider: "rule-based" });
  });
});
