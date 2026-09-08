import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/** Used when the configured paid model returns 402 (out of credits). */
const FREE_FALLBACK_MODELS = [
  "openrouter/free",
  "poolside/laguna-s-2.1:free",
];

export function getLlmModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export function getLlmClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Resume Tailor",
    },
  });
}

function llmStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableLlmError(err: unknown): boolean {
  const status = llmStatus(err);
  if (status === 402 || status === 429) return true;
  const name =
    err && typeof err === "object"
      ? String((err as { name?: unknown }).name || "")
      : "";
  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIUserAbortError"
  ) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /insufficient credits|rate limit|too many requests|timeout|timed out|aborted/i.test(
    message,
  );
}

function toLlmError(err: unknown): Error {
  const status = llmStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 402 || /insufficient credits/i.test(message)) {
    return new Error(
      "OpenRouter is out of credits for the paid model. Add credits at https://openrouter.ai/settings/credits, or set OPENROUTER_MODEL to a free model such as openrouter/free.",
    );
  }
  if (status) {
    return new Error(`OpenRouter error (${status}): ${message}`);
  }
  return err instanceof Error ? err : new Error("OpenRouter request failed.");
}

let skipPreferredModel = false;

export async function completeJson(options: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  emptyError: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getLlmClient();
  const preferred = getLlmModel();
  const models = [
    ...(skipPreferredModel ? [] : [preferred]),
    ...FREE_FALLBACK_MODELS.filter((model) => model !== preferred),
  ];

  let lastError: unknown;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: options.temperature,
          max_tokens: options.maxTokens ?? 8000,
          response_format: { type: "json_object" },
          messages: options.messages,
        },
        { timeout: 90_000, maxRetries: 0 },
      );
      const content = completion.choices[0]?.message?.content;
      if (!content?.trim()) {
        throw new Error(options.emptyError);
      }
      return content;
    } catch (err) {
      lastError = err;
      if (model === preferred && isRetryableLlmError(err)) {
        skipPreferredModel = true;
      }
      const canFallback =
        isRetryableLlmError(err) && i < models.length - 1;
      if (canFallback) continue;
      throw toLlmError(err);
    }
  }

  throw toLlmError(lastError);
}
