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

const HARVEST_STOP = new Set(
  [
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "your",
    "you",
    "are",
    "will",
    "our",
    "job",
    "role",
    "team",
    "work",
    "plus",
    "must",
    "have",
    "ability",
    "experience",
    "years",
    "including",
    "using",
    "across",
    "about",
    "into",
    "other",
    "such",
    "than",
    "their",
    "they",
    "them",
    "type",
    "title",
    "location",
    "remote",
    "contractor",
    "full",
    "time",
    "part",
  ].map((w) => w.toLowerCase()),
);

/** Pull short skill/duty phrases from scraped JD text when the LLM undershoots. */
export function harvestJdPhrases(rawJd: string, limit = 40): string[] {
  const text = rawJd
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/[•·]/g, "\n");
  const seen = new Set<string>();
  const phrases: string[] = [];

  const push = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trim().replace(/^[-*•\d.)\s]+/, "");
    if (trimmed.length < 2 || trimmed.length > 60) return;
    const words = trimmed.split(" ");
    if (words.length > 8) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key) || HARVEST_STOP.has(key)) return;
    if (words.length === 1 && HARVEST_STOP.has(key)) return;
    seen.add(key);
    phrases.push(trimmed);
  };

  for (const line of text.split(/[\n|;]+/)) {
    push(line);
    for (const part of line.split(/,(?=\s)/)) {
      push(part);
    }
  }

  for (const match of text.matchAll(
    /\b(?:[A-Z][A-Za-z0-9.+#]{1,24}|[A-Za-z]{3,}(?:\.js|SQL)?|C\+\+|C#|CI\/CD|REST|GraphQL|TypeScript|JavaScript|Next\.js|Node\.js)\b/g,
  )) {
    push(match[0]);
  }

  return phrases.slice(0, limit);
}

export function padExtractedFromText(
  extracted: ExtractedJD,
  rawJd: string,
  min = JD_KEYWORD_MIN,
): ExtractedJD {
  let next = dedupeJdLists(extracted);
  if (countJdKeywords(next) >= min) return next;

  const harvested = harvestJdPhrases(rawJd);
  for (const phrase of harvested) {
    if (countJdKeywords(next) >= min) break;
    const looksTech =
      /[A-Z]|\.js|\+|#|SQL|CSS|HTML|API|UI|UX|CI/i.test(phrase) &&
      phrase.split(" ").length <= 3;
    next = dedupeJdLists({
      ...next,
      requiredSkills: looksTech
        ? next.requiredSkills
        : [...next.requiredSkills, phrase],
      repeatedTechnologies: looksTech
        ? [...next.repeatedTechnologies, phrase]
        : next.repeatedTechnologies,
    });
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
