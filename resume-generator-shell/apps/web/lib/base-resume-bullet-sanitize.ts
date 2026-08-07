/**
 * Clean and validate resume bullets for the upload/tailor pipeline.
 * Keeps meaning when possible; drops junk/broken fragments that make
 * tailored PDFs look corrupted.
 */

import { decodeEncodedPdfText } from "./pdf-encoding-decode";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/;
const INTL_PHONE_RE = /\+\d{1,3}(?:[\s().-]?\d){7,14}/;
const PAGE_MARKER_RE =
  /^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$|^\d+\s+of\s+\d+$/i;
const BARE_DATE_RE =
  /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}(?:\s*[-–—to]+\s*(?:Present|Current|Now|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?\d{4}))?$/i;
// Short place-only lines like "Bellevue, Nebraska" / "Austin, TX".
// Keep this tight — a loose "words, words" pattern falsely kills real bullets.
const LOCATION_ONLY_RE =
  /^(?:[A-Z][\p{L}.'-]{1,24}(?:\s+[A-Z][\p{L}.'-]{1,24}){0,3}),\s*(?:[A-Z]{2}|[A-Z][\p{L}.'-]{2,24}(?:\s+[A-Z][\p{L}.'-]{1,24}){0,2})(?:\s*,\s*[A-Z][\p{L}.'\s-]{2,32})?(?:\s*\+?\d[\d\s().-]{6,})?$/u;
const BULLET_PREFIX_RE =
  /^(?:[-*•●○▪◦–—]|\u00f0|\u00b7|\u2022|\uf0b7|ð)\s*/u;
const WEIRD_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const MOJIBAKE_BULLET_RE = /(?:ð\s*[•·]|ï¿½|Â·|\u00f0\s*[•·])/g;

const NONSENSE_BULLET_RE =
  /\b(?:improved comfortable|architected a market leader|accelerated across global|consolidated strong grasp|market leader in their space through architecture decision records)\b/i;

export function cleanResumeExtractText(text: string): string {
  const normalized = text
    .replace(/\r/g, "")
    .replace(WEIRD_CONTROL_RE, "")
    .replace(MOJIBAKE_BULLET_RE, "• ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Decode custom-encoded PDF lines (broken ToUnicode / cipher fonts).
  return normalized
    .split("\n")
    .map((line) => decodeEncodedPdfText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Light cleanup used before wrapping/coalescing (no capitalize / connector strip). */
export function softCleanBulletText(text: string): string {
  return decodeEncodedPdfText(text)
    .replace(WEIRD_CONTROL_RE, "")
    .replace(MOJIBAKE_BULLET_RE, " ")
    .replace(BULLET_PREFIX_RE, "")
    .replace(/[–—]/g, "-")
    // Repair words glued across PDF font runs: "andTensorRT" → "and TensorRT"
    // (do NOT split legitimate camelCase like TypeScript / GitHub / BigQuery)
    .replace(
      /\b(and|the|for|with|from|into|using|via|on|to|by|of|as|or)([A-Z])/g,
      "$1 $2",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function sanitizeBulletText(text: string): string {
  let value = softCleanBulletText(text);

  // Drop orphan date fragments leaked from PDF headers into bullet text.
  value = value
    .replace(
      /\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|Current|Now|\d{4})\s+/i,
      " ",
    )
    .replace(/\s+\d{4}\s*[-–—]\s*(?:Present|Current|Now)\s+/i, " ")
    .replace(
      /\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-–—]\s*(?:Present|Current|Now|\d{4})\s*$/i,
      "",
    )
    .replace(/\s+\d{4}\s*[-–—]\s*(?:Present|Current|Now|\d{4})\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip trailing dangling connectors from split PDF lines (final only).
  value = value.replace(/(?:,|;|\band|\bwith|\bfor|\bto|\bby|\bthrough)\s*$/i, "").trim();

  if (value && !/[.!?]$/.test(value) && value.length > 60) {
    value = `${value}.`;
  }
  if (value) {
    value = value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

export function isJunkBulletText(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return true;
  if (value.length < 28) return true;
  if (PAGE_MARKER_RE.test(value)) return true;
  if (BARE_DATE_RE.test(value)) return true;
  if (EMAIL_RE.test(value) && value.length < 80) return true;
  if (INTL_PHONE_RE.test(value) && value.replace(INTL_PHONE_RE, "").trim().length < 24) {
    return true;
  }
  if (PHONE_RE.test(value) && value.replace(PHONE_RE, "").trim().length < 12) return true;
  if (value.length <= 64 && LOCATION_ONLY_RE.test(value)) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (/linkedin\.com/i.test(value) && value.length < 120) return true;
  if (NONSENSE_BULLET_RE.test(value)) return true;
  // Mostly punctuation / symbols (count unicode letters)
  if ((value.match(/\p{L}/gu) ?? []).length < 18) return true;
  return false;
}

export function isWeakOrBrokenBulletText(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (isJunkBulletText(value)) return true;
  if (NONSENSE_BULLET_RE.test(value)) return true;
  if (
    /\b(?:using go through|go through|can to|experience with|and'?re in the middle)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  // Incomplete truncated fragments.
  if (/\b(?:the|a|an|and|with|for|to|of|in|on)\s*$/i.test(value) && value.length < 90) {
    return true;
  }
  return false;
}

/**
 * Merge PDF-wrapped continuation lines into complete bullets and drop junk.
 */
export function coalesceBulletLines(lines: readonly string[]): string[] {
  const merged: string[] = [];
  for (const raw of lines) {
    const decodedRaw = decodeEncodedPdfText(raw).trim();
    const soft = softCleanBulletText(raw);
    if (!soft) continue;
    // Hard junk (contact/page lines) must never become or glue onto bullets.
    if (
      PAGE_MARKER_RE.test(soft) ||
      (EMAIL_RE.test(soft) && soft.length < 80) ||
      (INTL_PHONE_RE.test(soft) && soft.replace(INTL_PHONE_RE, "").trim().length < 24) ||
      (PHONE_RE.test(soft) && soft.replace(PHONE_RE, "").trim().length < 12) ||
      LOCATION_ONLY_RE.test(soft)
    ) {
      continue;
    }

    const startsNewBullet =
      BULLET_PREFIX_RE.test(raw.trim()) ||
      BULLET_PREFIX_RE.test(decodedRaw) ||
      // Action-verb bullet starts (markers often stripped before a second coalesce pass)
      /^(?:Established|Engineered|Delivered|Designed|Developed|Championed|Orchestrated|Integrated|Implemented|Optimized|Created|Spearheaded|Devised|Launched|Automated|Initiated|Directed|Advanced|Strengthened|Played|Resolved|Transformed|Introduced|Built|Led|Owned|Improved|Collaborated|Coordinated)\b/.test(
        soft,
      );
    const previous = merged[merged.length - 1];
    const nextIsFragment = /^[a-z(]/.test(soft) || soft.length < 48;
    const previousOpen =
      Boolean(previous) &&
      (/(?:,|;|\band|\bwith|\bfor|\bto|\bby|\bthrough|\/)\s*$/i.test(previous!) ||
        /-$/.test(previous!));

    // Continuations are lowercase/parenthetical wraps, or short tails after an open clause.
    const continuation =
      Boolean(previous) &&
      !startsNewBullet &&
      (
        /^[a-z(]/.test(soft) ||
        (previousOpen && nextIsFragment) ||
        (previousOpen && /^[\d(%]/.test(soft))
      );

    if (continuation && previous) {
      const joiner = /-$/.test(previous) ? "" : " ";
      merged[merged.length - 1] = softCleanBulletText(`${previous}${joiner}${soft}`);
      continue;
    }

    if (isJunkBulletText(sanitizeBulletText(soft))) continue;
    merged.push(soft);
  }

  return merged
    .map((item) => sanitizeBulletText(item))
    .filter((item) => item.length > 0 && !isJunkBulletText(item));
}

export function sanitizeBulletList(bullets: readonly string[]): string[] {
  const coalesced = coalesceBulletLines(bullets);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const bullet of coalesced) {
    const cleaned = sanitizeBulletText(bullet);
    if (!cleaned || isJunkBulletText(cleaned)) continue;
    const key = cleaned.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }
  return unique;
}

/** Stricter filter for newly generated JD bullets. */
export function sanitizeGeneratedBulletList(bullets: readonly string[]): string[] {
  return sanitizeBulletList(bullets).filter((bullet) => !isWeakOrBrokenBulletText(bullet));
}
