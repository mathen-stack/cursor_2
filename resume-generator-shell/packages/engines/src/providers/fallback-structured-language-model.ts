import type {
  StructuredGenerationRequest,
  StructuredLanguageModel,
} from "./language-model";

export function isModelBillingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\bHTTP 402\b/i.test(message) ||
    /insufficient credits/i.test(message) ||
    /payment required/i.test(message) ||
    /credit.?balance/i.test(message)
  );
}

/**
 * Tries the primary model first, then falls back when the provider rejects
 * the request for billing/credit reasons (for example OpenRouter HTTP 402).
 */
export class FallbackStructuredLanguageModel implements StructuredLanguageModel {
  readonly name: string;

  constructor(
    private readonly primary: StructuredLanguageModel,
    private readonly fallback: StructuredLanguageModel,
  ) {
    this.name = `${primary.name}+fallback:${fallback.name}`;
  }

  async generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<unknown> {
    try {
      return await this.primary.generateStructured(request);
    } catch (error) {
      if (!isModelBillingError(error)) throw error;
      return this.fallback.generateStructured(request);
    }
  }
}
