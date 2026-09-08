import type { ExtractedJD } from "./types";

export const JD_KEYWORD_MIN = 25;
export const JD_KEYWORD_MAX = 35;

const LIST_KEYS = [
  "requiredSkills",
  "coreResponsibilities",
  "repeatedTechnologies",
  "preferredSkills",
  "domainKnowledge",
  "softSkills",
] as const;

type ListKey = (typeof LIST_KEYS)[number];

/** Drop order when over the max (keep required + responsibilities longest). */
const TRIM_ORDER: ListKey[] = [
  "preferredSkills",
  "softSkills",
  "domainKnowledge",
  "repeatedTechnologies",
  "coreResponsibilities",
  "requiredSkills",
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Unique keywords across title + the six lists (first spelling wins). */
export function collectedJdKeywords(extracted: ExtractedJD): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length < 2) return;
    const key = normalizeKey(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  push(extracted.targetRole);
  for (const listKey of LIST_KEYS) {
    for (const item of extracted[listKey]) push(item);
  }
  return result;
}

export function countJdKeywords(extracted: ExtractedJD): number {
  return collectedJdKeywords(extracted).length;
}

export function dedupeJdLists(extracted: ExtractedJD): ExtractedJD {
  const seen = new Set<string>();
  const take = (items: string[]): string[] => {
    const kept: string[] = [];
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed.length < 2) continue;
      const key = normalizeKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(trimmed);
    }
    return kept;
  };

  const targetRole = extracted.targetRole.trim() || "Software Engineer";
  seen.add(normalizeKey(targetRole));

  return {
    company: extracted.company,
    targetRole,
    requiredSkills: take(extracted.requiredSkills),
    coreResponsibilities: take(extracted.coreResponsibilities),
    repeatedTechnologies: take(extracted.repeatedTechnologies),
    preferredSkills: take(extracted.preferredSkills),
    domainKnowledge: take(extracted.domainKnowledge),
    softSkills: take(extracted.softSkills),
  };
}

export function capJdKeywords(
  extracted: ExtractedJD,
  max = JD_KEYWORD_MAX,
): ExtractedJD {
  let next = dedupeJdLists(extracted);
  while (countJdKeywords(next) > max) {
    let trimmed = false;
    for (const listKey of TRIM_ORDER) {
      if (next[listKey].length === 0) continue;
      next = {
        ...next,
        [listKey]: next[listKey].slice(0, -1),
      };
      trimmed = true;
      break;
    }
    if (!trimmed) break;
  }
  return next;
}

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
