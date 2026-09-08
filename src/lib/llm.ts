import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.4-mini";

export function getLlmModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export function getLlmClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}
