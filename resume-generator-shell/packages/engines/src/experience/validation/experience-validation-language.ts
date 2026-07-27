import { canonicalKeywordKey } from "../keywords/keyword-normalizer";

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of",
  "on", "or", "the", "to", "using", "with", "while", "across", "through",
  "that", "this", "their", "its", "measurable", "improving", "improved",
]);

const FIRST_PERSON = /\b(?:I|me|my|mine|we|us|our|ours)\b/i;
const WEAK_OPENING = /^(?:Responsible for|Worked on|Helped with|Assisted with|Participated in|Involved in)\b/i;
const FILLER = /\b(?:successfully|effectively|various|multiple different|numerous various|very|really)\b/i;
const VAGUE_BUZZWORDS =
  /\b(?:dynamic|proactive|synergistic|go[- ]getter|hard[- ]working|team player|results[- ]driven|proven track record|seasoned|passionate|motivated|detail[- ]oriented|self[- ]starter|innovative thinker|strategic thinker)\b/i;
const PASSIVE = /\b(?:was|were|been|being)\s+(?:built|developed|implemented|designed|deployed|managed|created|optimized|led|completed)\b/i;
const METRIC = /\b\d+(?:\.\d+)?\s?(?:%|x|ms|hours?|days?)(?=\s|[,.]|$)/i;
const BUSINESS_IMPACT = /\b(?:customer|user|revenue|cost|delivery|adoption|risk|quality|reliability|availability|productivity|efficiency|time-to-market|stakeholder|business|operations?)\b/i;
const SENIOR_SIGNAL = /\b(?:architect(?:ed|ure)?|strategy|roadmap|standard|governance|mentored|led|leadership|design review|technical direction|cross-functional|stakeholder)\b/i;
const COMMUNICATION_SIGNAL = /\b(?:collaborat|communicat|stakeholder|cross-functional|cross-team|product|business|requirements|presented|facilitated|alignment|partnered|partner with)\w*\b/i;

export function normalizeText(value: string): string {
  return canonicalKeywordKey(value)
    .replace(/\b\d+(?:\.\d+)?\b/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): Set<string> {
  const normalized = normalizeText(value);
  return new Set(
    normalized
      .split(/[^a-z0-9+#.]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

export function jaccard(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function sentenceSkeleton(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s?(?:%|x|ms|hours?|days?)\b/gi, "<metric>")
    .replace(/\b[A-Z][A-Za-z0-9.+#/-]*\b/g, "<tool>")
    .replace(/\s+/g, " ")
    .replace(/[^a-z<>\s-]/g, "")
    .trim();
}

export function metricFingerprint(value: string): string {
  // Identical hard numbers (% / x) are visible clones even when measures differ
  // ("delivering a 38% reduction in latency" vs "... in release failures").
  const amountMatch = value.match(/\b(\d+(?:\.\d+)?)\s?(%|x)(?=\s|[,.]|$)/i);
  if (amountMatch) {
    return `value:${amountMatch[2]!.toLowerCase()}:${amountMatch[1]}`;
  }
  const match = value.match(/\b\d+(?:\.\d+)?\s?(ms|hours?|days?)(?=\s|[,.]|$)/i);
  const unit = match?.[1]?.toLowerCase() ?? "missing";
  const measureMatch = value.match(
    /\b(?:increasing|reducing|maintaining|improved|improving|increased|reduced|accelerating|shortening)\s+([^,]+?)\s+by\s+\d+/i,
  );
  const measure = normalizeText(measureMatch?.[1] ?? "");
  if (measure) {
    return `${unit}:measure:${measure}`;
  }
  const context = value
    .replace(/\b\d+(?:\.\d+)?\s?(?:%|x|ms|hours?|days?)\b/gi, "")
    .split(/[,;]/)
    .slice(-1)[0] ?? value;
  return `${unit}:${normalizeText(context)}`;
}

export function hasIntraBulletVerbEcho(value: string): boolean {
  return (
    /\bCoordinat\w*\b[^.]*\bcoordination\b/i.test(value) ||
    /\bAlign\w*\b[^.]*\balignment\b/i.test(value) ||
    /\bAutomat\w*\b[^.]*\bautomation\b/i.test(value)
  );
}

export function hasRepeatedContentNoun(value: string): boolean {
  // Measure restated in the trailing outcome clause, including shared primary
  // nouns with different modifiers ("team delivery velocity" / "engineering velocity").
  if (
    /\b(increasing|reducing|maintaining|improving|accelerating|shortening)\s+((?:[a-z][a-z0-9+./-]*\s+){0,3}[a-z][a-z0-9+./-]*)\s+by\s+(\d+(?:\.\d+)?(?:%|x))\s+and\s+(?:improving|advancing|strengthening)\s+(?:[a-z][a-z0-9+./-]*\s+)?\2\b/i.test(
      value,
    )
  ) {
    return true;
  }
  return /\b(increasing|reducing|maintaining|improving|accelerating|shortening)\s+(?:[a-z][a-z0-9+./-]*\s+){0,3}(velocity|throughput|adoption|latency|reliability)\b[^.]*\b(?:improving|advancing|strengthening)\s+(?:[a-z][a-z0-9+./-]*\s+)?\2\b/i.test(
    value,
  );
}

export function hasMetric(value: string): boolean {
  return METRIC.test(value);
}

export function hasBusinessImpact(value: string): boolean {
  return BUSINESS_IMPACT.test(value);
}

export function hasSeniorSignal(value: string): boolean {
  return SENIOR_SIGNAL.test(value);
}

export function hasCommunicationSignal(value: string): boolean {
  return COMMUNICATION_SIGNAL.test(value);
}

export function atsLanguageErrors(value: string): string[] {
  const errors: string[] = [];
  if (FIRST_PERSON.test(value)) errors.push("Uses a first-person pronoun.");
  if (WEAK_OPENING.test(value)) errors.push("Starts with weak responsibility language.");
  if (FILLER.test(value)) errors.push("Contains filler or self-congratulatory wording.");
  if (VAGUE_BUZZWORDS.test(value)) {
    errors.push("Contains vague resume buzzwords that should be replaced with concrete evidence.");
  }
  if (PASSIVE.test(value)) errors.push("Uses avoidable passive voice.");
  if (!/^[A-Z][A-Za-z-]+\s/.test(value)) errors.push("Does not begin with a clear action verb.");
  if (!value.endsWith(".")) errors.push("Does not end with a period.");
  if (/[;!?]/.test(value)) errors.push("Uses punctuation that weakens ATS scanability.");
  return errors;
}

export function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10;
}
