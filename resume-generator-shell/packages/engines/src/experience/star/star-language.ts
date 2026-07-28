const LEADING_ACTION = /^(?:architect|automate|build|collaborate|communicate|coordinate|create|define|deliver|deploy|design|develop|drive|ensure|establish|evaluate|implement|improve|integrate|lead|maintain|manage|mentor|monitor|optimize|own|partner|perform|present|productionize|reduce|scale|secure|support|test|translate|troubleshoot)(?:s|ed|ing)?\s+(?:with\s+|on\s+|for\s+|to\s+)?/i;

export function cleanScope(value: string): string {
  const trimmed = value
    .replace(/[.?!;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return "";
  }

  const stripped = trimmed
    .replace(LEADING_ACTION, "")
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
