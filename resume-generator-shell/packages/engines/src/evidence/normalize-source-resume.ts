import { createHash } from "node:crypto";

export interface NormalizedSourceResume {
  rawText: string;
  normalizedText: string;
  contentHash: string;
}

export function normalizeSourceResume(rawText: string): NormalizedSourceResume {
  const normalizedText = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    rawText,
    normalizedText,
    contentHash: createHash("sha256").update(normalizedText).digest("hex"),
  };
}
