import type { ExtractedJD } from "./types";

/** Tech/domain terms used for ATS matching and skill fallbacks. */
export function jdTechKeywords(extracted: ExtractedJD): string[] {
  return [
    ...extracted.requiredSkills,
    ...extracted.repeatedTechnologies,
    ...extracted.preferredSkills,
    ...extracted.domainKnowledge,
  ]
    .map((item) => item.trim())
    .filter(Boolean);
}
