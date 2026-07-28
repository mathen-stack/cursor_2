const LEADING_ACTION =
  /^(?:accelerat(?:e|es|ed|ing)|architect(?:s|ed|ing)?|automat(?:e|es|ed|ing)|build(?:s|ing)?|collaborat(?:e|es|ed|ing)|communicat(?:e|es|ed|ing)|consolidat(?:e|es|ed|ing)|coordinat(?:e|es|ed|ing)|creat(?:e|es|ed|ing)|defin(?:e|es|ed|ing)|deliver(?:s|ed|ing)?|deploy(?:s|ed|ing)?|design(?:s|ed|ing)?|develop(?:s|ed|ing)?|driv(?:e|es|en|ing)|ensur(?:e|es|ed|ing)|establish(?:es|ed|ing)?|evaluat(?:e|es|ed|ing)|facilitat(?:e|es|ed|ing)|govern(?:s|ed|ing)?|guid(?:e|es|ed|ing)|harden(?:s|ed|ing)?|implement(?:s|ed|ing)?|improv(?:e|es|ed|ing)|instrument(?:s|ed|ing)?|integrat(?:e|es|ed|ing)|launch(?:es|ed|ing)?|lead(?:s|ing)?|led|maintain(?:s|ed|ing)?|manag(?:e|es|ed|ing)|mentor(?:s|ed|ing)?|moderniz(?:e|es|ed|ing)|monitor(?:s|ed|ing)?|optimiz(?:e|es|ed|ing)|orchestrat(?:e|es|ed|ing)|own(?:s|ed|ing)?|partner(?:s|ed|ing)?|perform(?:s|ed|ing)?|present(?:s|ed|ing)?|productioniz(?:e|es|ed|ing)|rationaliz(?:e|es|ed|ing)|reduc(?:e|es|ed|ing)|reengineer(?:s|ed|ing)?|remediat(?:e|es|ed|ing)|right[- ]siz(?:e|es|ed|ing)|scal(?:e|es|ed|ing)|secur(?:e|es|ed|ing)|spearhead(?:s|ed|ing)?|stabiliz(?:e|es|ed|ing)|standardiz(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|strengthen(?:s|ed|ing)?|support(?:s|ed|ing)?|test(?:s|ed|ing)?|translat(?:e|es|ed|ing)|transform(?:s|ed|ing)?|troubleshoot(?:s|ed|ing)?|tun(?:e|es|ed|ing)|validat(?:e|es|ed|ing))\s+(?:with\s+|on\s+|for\s+|to\s+)?/i;

export function cleanScope(value: string): string {
  let trimmed = value
    .replace(/[.?!;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return "";
  }

  // Em-dash / hyphen JD banners often glue two imperatives together.
  // Prefer the first clause when it already has a usable noun phrase.
  if (/\s*[–—-]\s+/.test(trimmed)) {
    const parts = trimmed
      .split(/\s*[–—-]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const preferred =
      parts.find((part) => !/^(?:experience|proficiency|knowledge)\b/i.test(part)) ??
      parts[0] ??
      trimmed;
    trimmed = preferred;
  }

  trimmed = trimmed
    .replace(
      /^(?:experience|proficiency|knowledge|expertise|familiarity)\s+(?:with|in|of|using)\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  // Drop incomplete trailing clauses from truncated JD sentences.
  trimmed = trimmed
    .replace(/\bso\s+(?:new|that)\b.*$/i, "")
    .replace(/\bmarkets?\s+can\b.*$/i, "")
    .replace(/\bcan\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const stripped = trimmed
    .replace(LEADING_ACTION, "")
    .replace(
      /\band\s+(?:accelerat|automat|build|collaborat|communicat|consolidat|coordinat|creat|defin|deliver|deploy|design|develop|driv|ensur|establish|evaluat|facilitat|guid|harden|implement|improv|instrument|integrat|launch|lead|maintain|manag|mentor|moderniz|monitor|optimiz|orchestrat|own|partner|perform|present|productioniz|reduc|remediat|scal|secur|spearhead|stabiliz|standardiz|streamlin|strengthen|support|test|translat|transform|tun|validat)(?:e|es|ed|ing)?\b/gi,
      " and",
    )
    .replace(/\s+and$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) {
    return trimmed;
  }

  // Keep noun phrases like "design documents" intact. Stripping the leading
  // action token would otherwise leave a single weak remnant and cause later
  // composition to drop the allocated JD keyword entirely.
  if (
    stripped.split(/\s+/).filter(Boolean).length < 2 &&
    trimmed.split(/\s+/).filter(Boolean).length >= 2
  ) {
    return trimmed;
  }

  return stripped;
}

export function isActionPhrase(value: string): boolean {
  return LEADING_ACTION.test(value.trim());
}

export function taskObjective(value: string): string {
  const normalized = value.replace(/[.?!;:,]+$/g, "").trim();
  if (!normalized) {
    return "deliver the assigned JD requirement";
  }
  if (isActionPhrase(normalized)) {
    return `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
  }
  return `deliver ${normalized}`;
}

export function actionObject(values: readonly string[], fallback: string): string {
  const nounPhrase = values.find((value) => !isActionPhrase(value));
  return cleanScope(nounPhrase ?? values[0] ?? fallback) || cleanScope(fallback);
}
