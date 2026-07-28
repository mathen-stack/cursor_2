import type {
  StructuredGenerationRequest,
  StructuredLanguageModel,
} from "./language-model";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<FetchResponseLike>;

export interface OpenAICompatibleStructuredModelOptions {
  providerName: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  httpReferer?: string;
  applicationTitle?: string;
  fetchImpl?: FetchLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMessageContent(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("Structured-model response must be an object.");
  }

  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") {
    throw new Error(error.message);
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Structured-model response contains no choices.");
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new Error("Structured-model response has an invalid message shape.");
  }

  const content = firstChoice.message.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((item) => {
        if (!isRecord(item)) return "";
        if (typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
    if (combined.length > 0) return combined;
  }

  throw new Error("Structured-model response contains no text content.");
}

function schemaName(task: string): string {
  const normalized = task.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
  return normalized.length > 0 ? normalized : "structured_response";
}

export class OpenAICompatibleStructuredModel
  implements StructuredLanguageModel
{
  readonly name: string;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: OpenAICompatibleStructuredModelOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("A non-empty model-provider API key is required.");
    }
    if (!options.model.trim()) {
      throw new Error("A non-empty model name is required.");
    }

    this.name = `${options.providerName}:${options.model}`;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<unknown> {
    const body = {
      model: this.options.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ task: request.task, ...request.input }),
        },
      ],
      temperature: request.temperature ?? 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName(request.task),
          strict: true,
          schema: request.jsonSchema,
        },
      },
      stream: false,
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        };
        if (this.options.httpReferer) {
          headers["HTTP-Referer"] = this.options.httpReferer;
        }
        if (this.options.applicationTitle) {
          headers["X-OpenRouter-Title"] = this.options.applicationTitle;
        }

        const response = await this.fetchImpl(
          `${this.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const responseText = await response.text();
          const retryable = response.status === 429 || response.status >= 500;
          const error = new Error(
            `Model provider returned HTTP ${response.status}: ${responseText.slice(0, 500)}`,
          );
          if (!retryable || attempt === this.maxRetries) throw error;
          lastError = error;
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 4_000)),
          );
          continue;
        }

        const payload = await response.json();
        const content = extractMessageContent(payload);
        return JSON.parse(content) as unknown;
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error("Unknown provider error.");
        const aborted = normalized.name === "AbortError";
        lastError = aborted
          ? new Error(`Model provider timed out after ${this.timeoutMs} ms.`)
          : normalized;
        if (attempt === this.maxRetries) throw lastError;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1_000 * 2 ** attempt, 4_000)),
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error("Structured generation failed.");
  }
}
