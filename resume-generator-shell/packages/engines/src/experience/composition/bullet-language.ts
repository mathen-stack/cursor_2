import type {
  AchievementDimension,
  BulletPlanItem,
} from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarMetric, StarStory } from "../types/star-story";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";
import { cleanScope } from "../star/star-language";
import { joinNatural, lowerFirst } from "../star/star-utils";

/**
 * Unique short noun phrases used when direct JD scopes are exhausted.
 * Avoid bare achievement-dimension labels — those clone across roles.
 */
const UNIQUE_SCOPE_POOL: Readonly<
  Record<AchievementDimension, readonly string[]>
> = {
  "architecture-design": [
    "service boundary standards",
    "integration design patterns",
    "resilient system blueprints",
    "modular platform contracts",
  ],
  "production-delivery": [
    "release readiness controls",
    "deployment automation paths",
    "production rollout gates",
    "repeatable ship workflows",
  ],
  "performance-optimization": [
    "critical path latency",
    "runtime efficiency targets",
    "request throughput capacity",
    "hot-path resource tuning",
  ],
  "reliability-observability": [
    "production health signals",
    "incident detection coverage",
    "service-level telemetry",
    "operational alert fidelity",
  ],
  "quality-automation": [
    "automated validation gates",
    "regression coverage controls",
    "repeatable quality checks",
    "delivery workflow orchestration",
  ],
  "scalability-capacity": [
    "peak traffic headroom",
    "workload partitioning controls",
    "elastic capacity targets",
    "horizontal scale pathways",
  ],
  "cost-efficiency": [
    "idle capacity reduction",
    "compute spend efficiency",
    "infrastructure utilization targets",
    "unit-cost operating controls",
  ],
  "security-governance": [
    "access control coverage",
    "policy enforcement checks",
    "secure delivery practices",
    "audit-ready control paths",
  ],
  "data-quality": [
    "ingestion integrity checks",
    "pipeline validation rules",
    "lineage accuracy controls",
    "downstream data trust signals",
  ],
  "customer-business-impact": [
    "customer-facing reliability outcomes",
    "product adoption levers",
    "measurable value delivery",
    "outcome-focused ship priorities",
  ],
  "cross-functional-alignment": [
    "stakeholder requirements alignment",
    "cross-functional product planning",
    "business stakeholder agreements",
    "product team delivery alignment",
  ],
  "technical-leadership": [
    "technical strategy direction",
    "architecture roadmap leadership",
    "engineering design standards",
    "technical leadership priorities",
  ],
  "mentoring-knowledge-sharing": [
    "engineering coaching loops",
    "shared practice documentation",
    "onboarding enablement paths",
    "team capability workshops",
  ],
  "implementation-integration": [
    "service interface contracts",
    "end-to-end workflow handoffs",
    "integration reliability paths",
    "automated system connections",
  ],
};

const TERMINAL_PUNCTUATION = /[.!?;:,]+$/g;
const LEADING_CONNECTOR = /^(?:which|that|and|while|thereby|resulting in)\s+/i;
const WEAK_FILLER = /\b(?:responsible for|worked on|helped with|assisted with|participated in|involved in|various|multiple tasks|successfully|effectively)\b/gi;

const PRESERVED_TOKEN_CASE: Readonly<Record<string, string>> = {
  docker: "Docker",
  kubernetes: "Kubernetes",
  mlflow: "MLflow",
  prometheus: "Prometheus",
  grafana: "Grafana",
  airflow: "Airflow",
  spark: "Spark",
  snowflake: "Snowflake",
  databricks: "Databricks",
  terraform: "Terraform",
  jenkins: "Jenkins",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  langchain: "LangChain",
  llamaindex: "LlamaIndex",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  fastapi: "FastAPI",
  flask: "Flask",
  django: "Django",
  react: "React",
  typescript: "TypeScript",
  javascript: "JavaScript",
  kafka: "Kafka",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  sql: "SQL",
  dbt: "dbt",
};

export function stripTerminal(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(TERMINAL_PUNCTUATION, "");
}

/**
 * Resume bullets must stay third-person. JD wording often contains "our/we/us";
 * strip those pronouns so composed text and keyword checks stay consistent.
 */
export function stripFirstPersonPronouns(value: string): string {
  return value
    .replace(/\b(?:I|me|my|mine|we|us|our|ours)\b/gi, " ")
    .replace(/\s+'/g, "'")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBulletSentence(value: string): string {
  const normalized = stripFirstPersonPronouns(
    value
      .replace(WEAK_FILLER, "")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,+/g, ", ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?]+$/g, ""),
  );
  if (!normalized) {
    return "";
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
}

export function substantiveKeyword(keyword: string): string {
  if (/^mentor(?:ed|ing|s)?\s+engineers?\b/i.test(keyword.trim())) {
    return "engineer mentoring";
  }
  const cleaned = cleanScope(stripFirstPersonPronouns(keyword));
  const withoutSeniority = cleaned
    .replace(/^(?:entry[- ]level|junior|mid[- ]level|senior|lead|staff|principal|chief)\s+/i, "")
    .replace(/\s+(?:engineer|developer|scientist|architect|manager|specialist|analyst)$/i, "")
    .trim();
  const phrase = withoutSeniority || cleaned || stripTerminal(keyword);
  return phrase
    .split(/\s+/)
    .map((token) => {
      const preserved = PRESERVED_TOKEN_CASE[token.toLocaleLowerCase()];
      if (preserved) {
        return preserved;
      }
      return /(?:[./]|\d)/.test(token) || /^[A-Z]{2,}[a-z]?$/.test(token)
        ? token
        : token.toLocaleLowerCase();
    })
    .join(" ");
}

function uniquePhrases(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const value of values) {
    const cleaned = stripTerminal(value);
    const key = canonicalKeywordKey(cleaned);
    if (!cleaned || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(cleaned);
  }
  return selected;
}

function removeContainedPhrases(values: readonly string[]): string[] {
  const ordered = uniquePhrases(values).sort((left, right) => right.length - left.length);
  return ordered.filter((value, index) => {
    const lower = value.toLocaleLowerCase();
    return !ordered.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.length > value.length &&
        other.toLocaleLowerCase().includes(lower),
    );
  });
}

function scopeTokenSet(key: string): Set<string> {
  return new Set(key.split("|").filter(Boolean));
}

function scopeOverlapRatio(leftKey: string, rightKey: string): number {
  const left = scopeTokenSet(leftKey);
  const right = scopeTokenSet(rightKey);
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(left.size, right.size);
}

/** True when a candidate noun phrase is still unused document-wide. */
export function isUnusedVisibleScope(
  phrase: string,
  usedScopeKeys: ReadonlySet<string>,
): boolean {
  const cleaned = substantiveKeyword(stripFirstPersonPronouns(phrase));
  const key = canonicalKeywordKey(cleaned);
  if (!cleaned || !key) {
    return false;
  }
  if (usedScopeKeys.has(key)) {
    return false;
  }
  // Reject when the candidate shares a long consecutive word span already locked
  // from a prior bullet (e.g. "machine learning models in production").
  const words = cleaned
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s./+-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 3; size <= Math.min(8, words.length - start); size += 1) {
      const windowKey = canonicalKeywordKey(words.slice(start, start + size).join(" "));
      if (windowKey && usedScopeKeys.has(windowKey)) {
        return false;
      }
    }
  }
  for (const usedKey of usedScopeKeys) {
    if (scopeTokenSet(usedKey).size < 2) {
      continue;
    }
    if (scopeOverlapRatio(key, usedKey) >= 0.6) {
      return false;
    }
  }
  return true;
}

/**
 * Lock multi-word visible scopes from composed text so later bullets cannot
 * fall back onto the same JD noun phrase (even via focus/theme text).
 */
export function registerVisibleScopeKeys(
  text: string,
  usedScopeKeys: Set<string>,
): void {
  const cleaned = stripFirstPersonPronouns(stripTerminal(text));
  if (!cleaned) {
    return;
  }
  const words = cleaned
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s./+-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 3; size <= Math.min(10, words.length - start); size += 1) {
      const phrase = words.slice(start, start + size).join(" ");
      const key = canonicalKeywordKey(phrase);
      if (key && key.split("|").filter(Boolean).length >= 3) {
        usedScopeKeys.add(key);
      }
    }
  }
  const fullKey = canonicalKeywordKey(cleaned);
  if (fullKey) {
    usedScopeKeys.add(fullKey);
  }
}

/** Matches sentence-quality COMMUNICATION_SIGNAL. */
const COMMUNICATION_SCOPE_SIGNAL =
  /stakeholder|cross-functional|product|business|alignment|requirements|team/i;
/** Matches sentence-quality LEADERSHIP_SIGNAL. */
const LEADERSHIP_SCOPE_SIGNAL =
  /strategy|direction|leadership|architecture|roadmap|design decision|standard/i;

function pickUniqueScopeFromPool(
  pool: readonly string[],
  plan: BulletPlanItem,
  usedScopeKeys: ReadonlySet<string>,
  requiredSignal?: RegExp,
): string {
  const offset = Math.max(0, plan.sequence - 1);
  const matchesSignal = (candidate: string): boolean =>
    !requiredSignal || requiredSignal.test(candidate);
  for (let index = 0; index < pool.length; index += 1) {
    const candidate = pool[(index + offset) % pool.length];
    if (
      candidate &&
      matchesSignal(candidate) &&
      isUnusedVisibleScope(candidate, usedScopeKeys)
    ) {
      return candidate;
    }
  }
  for (const candidate of pool) {
    if (
      matchesSignal(candidate) &&
      isUnusedVisibleScope(candidate, usedScopeKeys)
    ) {
      return candidate;
    }
  }
  const base = pool[offset % pool.length] ?? "targeted delivery outcomes";
  return `${base} ${plan.sequence}`;
}

function pickUniqueDimensionScope(
  plan: BulletPlanItem,
  usedScopeKeys: ReadonlySet<string>,
  requiredSignal?: RegExp,
): string {
  const pool = UNIQUE_SCOPE_POOL[plan.achievementDimension] ?? [
    "targeted delivery outcomes",
  ];
  return pickUniqueScopeFromPool(pool, plan, usedScopeKeys, requiredSignal);
}

function selectShortFallbackScope(input: {
  plan: BulletPlanItem;
  usedScopeKeys: ReadonlySet<string>;
}): string {
  // Communication / leadership plans must keep validator signal words even when
  // direct JD scopes are exhausted — never fall through to unrelated focus text.
  if (input.plan.communicationFocused) {
    return pickUniqueDimensionScope(
      {
        ...input.plan,
        achievementDimension: "cross-functional-alignment",
      },
      input.usedScopeKeys,
      COMMUNICATION_SCOPE_SIGNAL,
    );
  }
  if (input.plan.leadershipFocused) {
    return pickUniqueDimensionScope(
      {
        ...input.plan,
        achievementDimension: "technical-leadership",
      },
      input.usedScopeKeys,
      LEADERSHIP_SCOPE_SIGNAL,
    );
  }

  const themeScope = cleanScope(
    stripFirstPersonPronouns(input.plan.achievementTheme || ""),
  );
  const focusScope = cleanScope(
    stripFirstPersonPronouns(input.plan.roleFocusArea || ""),
  );
  // Keep focus/theme fallbacks short so full JD requirement sentences cannot be
  // pasted as the action object across many bullets.
  const compactFocus =
    focusScope.split(/\s+/).filter(Boolean).length >= 2 &&
    focusScope.split(/\s+/).length <= 4 &&
    !/,| and | through | in production\b/i.test(focusScope)
      ? focusScope
      : "";
  const compactTheme =
    themeScope.split(/\s+/).filter(Boolean).length >= 2 &&
    themeScope.split(/\s+/).length <= 4 &&
    !/,| and | through | in production\b/i.test(themeScope)
      ? themeScope
      : "";
  for (const candidate of [compactFocus, compactTheme]) {
    if (candidate && isUnusedVisibleScope(candidate, input.usedScopeKeys)) {
      return candidate;
    }
  }
  return pickUniqueDimensionScope(input.plan, input.usedScopeKeys);
}

export function buildActionClause(input: {
  plan: BulletPlanItem;
  keywordPackage: KeywordPackage;
  story: StarStory;
  usedScopeKeys?: ReadonlySet<string>;
}): string {
  void input.story;
  const usedScopeKeys = input.usedScopeKeys ?? new Set<string>();
  const directScopes = removeContainedPhrases(
    input.keywordPackage.directKeywords
      .map(substantiveKeyword)
      .filter((keyword) => isUnusedVisibleScope(keyword, usedScopeKeys)),
  );
  const joinedDirectScope = joinNatural(directScopes);
  const shortFallback = selectShortFallbackScope({
    plan: input.plan,
    usedScopeKeys,
  });
  const directScope =
    joinedDirectScope.split(/\s+/).filter(Boolean).length >= 2
      ? joinedDirectScope
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 14)
          .join(" ")
      : shortFallback;
  const supportValues = removeContainedPhrases(
    input.keywordPackage.supportingKeywords
      .map(stripFirstPersonPronouns)
      .filter(
        (keyword) =>
          Boolean(keyword) &&
          !directScope.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()),
      ),
  );
  const explicitTools = supportValues.filter((keyword) =>
    input.keywordPackage.supportingKeywordDetails.some(
      (detail) =>
        stripFirstPersonPronouns(detail.keyword).toLocaleLowerCase() ===
          keyword.toLocaleLowerCase() &&
        detail.origin === "explicit-jd-tool",
    ),
  );
  const inferredMethods = supportValues.filter(
    (keyword) => !explicitTools.includes(keyword),
  );
  const supportClause = [
    explicitTools.length > 0 ? ` using ${joinNatural(explicitTools)}` : "",
    inferredMethods.length > 0 ? ` through ${joinNatural(inferredMethods)}` : "",
  ].join("");
  const verb = stripTerminal(input.keywordPackage.actionVerb);
  const normalizedDirectScope =
    /mentor|coach/i.test(verb) && /^(?:engineer mentoring|mentoring)$/i.test(directScope)
      ? "engineers on architecture decisions and delivery practices"
      : directScope;

  if (input.plan.communicationFocused) {
    const looksLikeGenericAlignment =
      /^(?:cross[- ]functional alignment|stakeholder alignment|collaboration)$/i.test(
        normalizedDirectScope,
      );
    // Keep the same signal vocabulary the sentence-quality validator requires.
    const communicationScope =
      !looksLikeGenericAlignment &&
      COMMUNICATION_SCOPE_SIGNAL.test(normalizedDirectScope)
        ? normalizedDirectScope
        : pickUniqueDimensionScope(
            {
              ...input.plan,
              achievementDimension: "cross-functional-alignment",
            },
            usedScopeKeys,
            COMMUNICATION_SCOPE_SIGNAL,
          );
    return stripTerminal(`${verb} ${communicationScope}${supportClause}`);
  }

  if (input.plan.leadershipFocused) {
    const leadershipScope = LEADERSHIP_SCOPE_SIGNAL.test(normalizedDirectScope)
      ? normalizedDirectScope
      : pickUniqueDimensionScope(
          {
            ...input.plan,
            achievementDimension: "technical-leadership",
          },
          usedScopeKeys,
          LEADERSHIP_SCOPE_SIGNAL,
        );
    return stripTerminal(`${verb} ${leadershipScope}${supportClause}`);
  }

  if (input.plan.achievementDimension === "mentoring-knowledge-sharing") {
    const mentoringScope = /mentor|coach|knowledge|engineer|onboard|workshop|capability/i.test(
      normalizedDirectScope,
    )
      ? normalizedDirectScope
      : pickUniqueDimensionScope(input.plan, usedScopeKeys);
    return stripTerminal(`${verb} ${mentoringScope}${supportClause}`);
  }

  return stripTerminal(`${verb} ${normalizedDirectScope}${supportClause}`);
}

export function metricAsGerund(metric: StarMetric): string {
  const text = stripTerminal(metric.displayText);
  return text
    .replace(/^increased\b/i, "increasing")
    .replace(/^reduced\b/i, "reducing")
    .replace(/^maintained\b/i, "maintaining")
    .replace(/^improved\b/i, "improving")
    .replace(/^accelerated\b/i, "accelerating")
    .replace(/^shortened\b/i, "shortening");
}

export function metricAsFinite(metric: StarMetric): string {
  return lowerFirst(stripTerminal(metric.displayText));
}

export function metricAsNoun(metric: StarMetric): string {
  if (metric.direction === "maintain") {
    return `${metric.value}${metric.unit} ${metric.measure}`;
  }
  const noun = metric.direction === "increase" ? "increase" : "reduction";
  return `a ${metric.value}${metric.unit} ${noun} in ${metric.measure}`;
}

export function uncoveredOutcomeKeywords(input: {
  actionClause: string;
  metrics: readonly StarMetric[];
  keywordPackage: KeywordPackage;
}): string[] {
  const coveredText = stripFirstPersonPronouns(
    `${input.actionClause} ${input.metrics
      .map((metric) => `${metric.displayText} ${metric.measure}`)
      .join(" ")}`,
  ).toLocaleLowerCase();
  return uniquePhrases(
    input.keywordPackage.outcomeKeywords.map(stripFirstPersonPronouns),
  ).filter(
    (keyword) => keyword && !coveredText.includes(keyword.toLocaleLowerCase()),
  );
}

export function compactBusinessImpact(story: StarStory, maximumWords = 9): string {
  const cleaned = stripFirstPersonPronouns(stripTerminal(story.businessImpact)).trim();
  const object = cleaned
    .replace(/^improved\s+/i, "better ")
    .replace(/^increased\s+/i, "greater ")
    .replace(/^accelerated\s+/i, "faster ")
    .replace(/^lowered\s+/i, "lower ")
    .replace(/^reduced\s+/i, "lower ")
    .replace(/^shortened\s+/i, "shorter ")
    .replace(/^expanded\s+/i, "expanded ")
    .replace(/^supported\s+/i, "support for ")
    .trim();
  return lowerFirst(object.split(/\s+/).slice(0, maximumWords).join(" "));
}

export function businessImpactAsGerund(story: StarStory, maximumWords = 11): string {
  const cleaned = stripFirstPersonPronouns(stripTerminal(story.businessImpact))
    .replace(/^improved\b/i, "improving")
    .replace(/^increased\b/i, "increasing")
    .replace(/^accelerated\b/i, "accelerating")
    .replace(/^lowered\b/i, "lowering")
    .replace(/^reduced\b/i, "reducing")
    .replace(/^shortened\b/i, "shortening")
    .replace(/^expanded\b/i, "expanding")
    .replace(/^supported\b/i, "supporting")
    .trim();
  return lowerFirst(cleaned.split(/\s+/).slice(0, maximumWords).join(" "));
}

export function businessImpactAsInfinitive(story: StarStory, maximumWords = 11): string {
  const cleaned = stripFirstPersonPronouns(stripTerminal(story.businessImpact))
    .replace(/^improved\b/i, "improve")
    .replace(/^increased\b/i, "increase")
    .replace(/^accelerated\b/i, "accelerate")
    .replace(/^lowered\b/i, "lower")
    .replace(/^reduced\b/i, "reduce")
    .replace(/^shortened\b/i, "shorten")
    .replace(/^expanded\b/i, "expand")
    .replace(/^supported\b/i, "support")
    .trim();
  return lowerFirst(cleaned.split(/\s+/).slice(0, maximumWords).join(" "));
}


export function wordCount(value: string): number {
  return value
    .replace(/[•]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function sentenceCount(value: string): number {
  const withoutDecimals = value.replace(/(?<=\d)\.(?=\d)/g, "");
  const matches = withoutDecimals.match(/[.!?](?:\s|$)/g);
  return matches?.length ?? 0;
}

export function containsPhraseConcept(text: string, phrase: string): boolean {
  const haystack = canonicalKeywordKey(text).split("|").filter(Boolean);
  const needle = canonicalKeywordKey(phrase).split("|").filter(Boolean);
  if (needle.length === 0) {
    return true;
  }
  const haystackSet = new Set(haystack);
  return needle.every((token) => haystackSet.has(token));
}

export function directKeywordRepresented(text: string, keyword: string): boolean {
  const normalizedText = stripFirstPersonPronouns(text);
  const normalizedKeyword = stripFirstPersonPronouns(keyword);
  const exact = normalizedText
    .toLocaleLowerCase()
    .includes(normalizedKeyword.toLocaleLowerCase());
  return (
    exact ||
    containsPhraseConcept(normalizedText, substantiveKeyword(normalizedKeyword))
  );
}
