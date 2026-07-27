/**
 * Provider-neutral structured generation contract.
 *
 * Concrete adapters for OpenAI, OpenRouter, Anthropic, or another provider can
 * implement this interface later without coupling any engine to a vendor SDK.
 */
export interface StructuredGenerationRequest {
  task: string;
  systemPrompt: string;
  input: Readonly<Record<string, unknown>>;
  jsonSchema: Readonly<Record<string, unknown>>;
  temperature?: number;
}

export interface StructuredLanguageModel {
  readonly name: string;
  generateStructured(request: StructuredGenerationRequest): Promise<unknown>;
}
