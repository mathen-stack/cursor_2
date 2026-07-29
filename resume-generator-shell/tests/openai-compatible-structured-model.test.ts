import { describe, expect, it } from "vitest";
import {
  OpenAICompatibleStructuredModel,
  type FetchLike,
} from "@resume/engines";

const REQUEST = {
  task: "extract",
  systemPrompt: "Return JSON.",
  input: { jobDescription: "A sufficiently long job description." },
  jsonSchema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
  temperature: 0,
};

describe("OpenAI-compatible structured model", () => {
  it("sends strict JSON schema and parses the assistant JSON", async () => {
    let receivedUrl = "";
    let receivedResponseFormat: unknown;
    const fakeFetch: FetchLike = async (url, init) => {
      receivedUrl = url;
      const receivedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      receivedResponseFormat = receivedBody.response_format;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '{"value":"ok"}' } }],
          };
        },
        async text() {
          return "";
        },
      };
    };

    const model = new OpenAICompatibleStructuredModel({
      providerName: "test-provider",
      apiKey: "secret",
      model: "test-model",
      baseUrl: "https://example.test/v1/",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });

    await expect(model.generateStructured(REQUEST)).resolves.toEqual({
      value: "ok",
    });
    expect(receivedUrl).toBe("https://example.test/v1/chat/completions");
    expect(receivedResponseFormat).toMatchObject({
      type: "json_schema",
    });
  });

  it("does not expose the API key in the request body", async () => {
    let body = "";
    const fakeFetch: FetchLike = async (_url, init) => {
      body = String(init.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '{"value":"ok"}' } }] };
        },
        async text() {
          return "";
        },
      };
    };
    const model = new OpenAICompatibleStructuredModel({
      providerName: "test",
      apiKey: "do-not-leak-this-key",
      model: "model",
      fetchImpl: fakeFetch,
      maxRetries: 0,
    });
    await model.generateStructured(REQUEST);
    expect(body).not.toContain("do-not-leak-this-key");
  });
});
