import { createHash, randomUUID } from "node:crypto";
import type { GenerationContext, JobDescription } from "@resume/contracts";

export function normalizeJobDescription(rawText: string): string {
  return rawText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function createJobDescription(rawText: string): JobDescription {
  const normalizedText = normalizeJobDescription(rawText);
  const contentHash = createHash("sha256").update(normalizedText).digest("hex");

  return {
    jdId: `JD-${randomUUID()}`,
    rawText,
    normalizedText,
    contentHash,
  };
}

export function createGenerationContext(
  profileId: string,
  jobDescription: JobDescription,
): GenerationContext {
  return {
    generationId: `GEN-${randomUUID()}`,
    profileId,
    jdId: jobDescription.jdId,
    jdHash: jobDescription.contentHash,
    createdAt: new Date().toISOString(),
    locale: "en-US",
  };
}
