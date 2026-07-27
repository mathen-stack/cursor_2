const TOKEN_ALIASES: Readonly<Record<string, string>> = {
  architected: "architect",
  architecting: "architect",
  architecture: "architect",
  automated: "automate",
  automating: "automate",
  automation: "automate",
  built: "build",
  building: "build",
  collaborated: "collaborate",
  collaborating: "collaborate",
  collaboration: "collaborate",
  communicated: "communicate",
  communicating: "communicate",
  communication: "communicate",
  deployed: "deploy",
  deploying: "deploy",
  deployment: "deploy",
  developed: "develop",
  developing: "develop",
  designed: "design",
  designing: "design",
  implemented: "implement",
  implementing: "implement",
  implementation: "implement",
  integrated: "integrate",
  integrating: "integrate",
  integration: "integrate",
  led: "lead",
  leading: "lead",
  leadership: "lead",
  monitored: "monitor",
  monitoring: "monitor",
  optimized: "optimize",
  optimizing: "optimize",
  optimization: "optimize",
  productionized: "deploy",
  productionizing: "deploy",
  reliable: "reliability",
  scalable: "scalability",
  scaled: "scalability",
  scaling: "scalability",
  stakeholders: "stakeholder",
  systems: "system",
  models: "model",
  pipelines: "pipeline",
  services: "service",
  workflows: "workflow",
  prometheus: "prometheus",
  kubernetes: "kubernetes",
  redis: "redis",
  typescript: "typescript",
  javascript: "javascript",
  postgres: "postgres",
  postgresql: "postgresql",
  aws: "aws",
};

const PHRASE_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmachine learning\b/gi, "ml"],
  [/\bartificial intelligence\b/gi, "ai"],
  [/\bcross[ -]functional\b/gi, "crossfunctional"],
  [/\bcontinuous integration(?: and|\s*\/\s*)continuous deployment\b/gi, "ci/cd"],
  [/\bcontinuous delivery\b/gi, "ci/cd"],
  [/\bresponse time\b/gi, "latency"],
  [/\binference speed\b/gi, "latency"],
  [/\boperational stability\b/gi, "reliability"],
  [/\bservice availability\b/gi, "availability"],
  [/\btime to market\b/gi, "delivery-speed"],
  [/\brelease velocity\b/gi, "delivery-speed"],
  [/\bdeployment velocity\b/gi, "deployment-speed"],
  [/\bcost savings?\b/gi, "cost-efficiency"],
  [/\bcloud spend\b/gi, "cost-efficiency"],
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "to",
  "using",
  "with",
  "within",
]);

function normalizeToken(token: string): string {
  const lower = token.toLowerCase();
  const alias = TOKEN_ALIASES[lower];
  if (alias) {
    return alias;
  }
  if (lower.endsWith("ies") && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith("ing") && lower.length > 5) {
    return lower.slice(0, -3);
  }
  if (lower.endsWith("ed") && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (
    lower.endsWith("s") &&
    lower.length > 3 &&
    !lower.endsWith("ss") &&
    !lower.endsWith("is") &&
    !lower.endsWith("us")
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

export function normalizeKeywordText(value: string): string {
  let normalized = value.trim();
  for (const [pattern, replacement] of PHRASE_ALIASES) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalKeywordKey(value: string): string {
  const tokens = normalizeKeywordText(value)
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return [...new Set(tokens)].sort().join("|");
}

export function canonicalActionVerbKey(value: string): string {
  return normalizeToken(normalizeKeywordText(value).split(/\s+/)[0] ?? value);
}

export function containsCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function findCaseInsensitiveRange(
  haystack: string,
  needle: string,
): { startIndex: number; endIndex: number; matchedText: string } | null {
  const startIndex = haystack.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (startIndex < 0) {
    return null;
  }
  return {
    startIndex,
    endIndex: startIndex + needle.length,
    matchedText: haystack.slice(startIndex, startIndex + needle.length),
  };
}
