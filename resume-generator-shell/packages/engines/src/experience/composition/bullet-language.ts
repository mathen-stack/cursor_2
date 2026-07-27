import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarMetric, StarStory } from "../types/star-story";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";
import { cleanScope } from "../star/star-language";
import { joinNatural, lowerFirst } from "../star/star-utils";

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
  "react.js": "React.js",
  "next.js": "Next.js",
  // Keep single-token replacements only. Expanding "tailwind" into
  // "Tailwind CSS" would duplicate the following CSS token.
  tailwind: "Tailwind",
  daisyui: "DaisyUI",
  websockets: "WebSockets",
  websocket: "WebSocket",
  vitest: "Vitest",
  cypress: "Cypress",
  jira: "Jira",
  confluence: "Confluence",
  git: "Git",
  typescript: "TypeScript",
  javascript: "JavaScript",
  kafka: "Kafka",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  sql: "SQL",
  css: "CSS",
  dbt: "dbt",
};

const PRESERVED_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["tailwind css", "Tailwind CSS"],
  ["css modules", "CSS Modules"],
  ["react.js", "React.js"],
  ["next.js", "Next.js"],
  ["restful apis", "RESTful APIs"],
  ["rest apis", "REST APIs"],
];

const PRESERVED_PHRASE_TOKENS = new Set(
  PRESERVED_PHRASES.flatMap(([, replacement]) => replacement.split(/\s+/)),
);

function applyPreservedPhrases(value: string): string {
  let result = value;
  for (const [needle, replacement] of PRESERVED_PHRASES) {
    result = result.replace(
      new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      replacement,
    );
  }
  return result;
}

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
  const withoutWeakFiller = phrase
    .replace(WEAK_FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
  return applyPreservedPhrases(withoutWeakFiller)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (PRESERVED_PHRASE_TOKENS.has(token)) {
        return token;
      }
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
    const compact = lower.replace(/\s+/g, " ").trim();
    return !ordered.some((other, otherIndex) => {
      if (otherIndex === index || other.length <= value.length) {
        return false;
      }
      const otherLower = other.toLocaleLowerCase();
      if (otherLower.includes(lower)) {
        return true;
      }
      // Treat "CSS" as contained by "CSS Modules" / "Tailwind CSS" even when
      // token boundaries differ only by separators.
      const otherTokens = new Set(otherLower.split(/[^a-z0-9+#.]+/).filter(Boolean));
      const valueTokens = compact.split(/[^a-z0-9+#.]+/).filter(Boolean);
      return (
        valueTokens.length > 0 &&
        valueTokens.every((token) => otherTokens.has(token))
      );
    });
  });
}

export function buildActionClause(input: {
  plan: BulletPlanItem;
  keywordPackage: KeywordPackage;
  story: StarStory;
}): string {
  const directScopes = removeContainedPhrases(
    input.keywordPackage.directKeywords.map(substantiveKeyword),
  );
  const joinedDirectScope = joinNatural(directScopes);
  const themeScope = cleanScope(
    stripFirstPersonPronouns(input.plan.achievementTheme || ""),
  );
  const focusScope = cleanScope(
    stripFirstPersonPronouns(input.plan.roleFocusArea || ""),
  );
  const compactFocus =
    focusScope.split(/\s+/).filter(Boolean).length > 0 &&
    focusScope.split(/\s+/).length <= 8 &&
    !/,| and | through /i.test(focusScope)
      ? focusScope
      : "";
  const compactTheme =
    themeScope.split(/\s+/).filter(Boolean).length > 0 &&
    themeScope.split(/\s+/).length <= 6
      ? themeScope
      : "";
  const compactTask = substantiveKeyword(input.story.task)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  // Never fall back to bare achievement-dimension labels such as
  // "cross functional alignment" or "reliability observability" — those clone
  // across roles whenever the same dimension is reused.
  const shortFallback =
    compactFocus ||
    compactTheme ||
    compactTask ||
    "production delivery outcomes";
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
  const verb = stripTerminal(input.keywordPackage.actionVerb);
  let normalizedDirectScope =
    /mentor|coach/i.test(verb) && /^(?:engineer mentoring|mentoring)$/i.test(directScope)
      ? "engineers on architecture decisions and delivery practices"
      : directScope;

  // Soft-skill prose and truncated JD fragments make ungrammatical bullets when
  // used as the action object. Replace them with ATS-safe collaboration or
  // delivery scopes grounded in the role focus.
  if (
    /^(?:strong|excellent|good|proven)?\s*verbal and written communication skills\b/i.test(
      normalizedDirectScope,
    ) ||
    /^(?:communication skills)\b/i.test(normalizedDirectScope)
  ) {
    normalizedDirectScope =
      compactFocus ||
      "cross-functional collaboration with product and engineering stakeholders";
  }
  if (
    /\bperformance and enhance\b/i.test(normalizedDirectScope) ||
    /\bthe effort to deliver\b/i.test(normalizedDirectScope) ||
    /^production frontend delivery outcomes$/i.test(normalizedDirectScope)
  ) {
    const toolScope = joinNatural(explicitTools.slice(0, 2));
    const methodScope = joinNatural(inferredMethods.slice(0, 2));
    const methodLooksLikeProcessOnly =
      /^(?:solution design|design reviews|technical documentation|delivery planning|architecture workshops)\b/i.test(
        methodScope,
      ) || / and /i.test(methodScope) && !/[A-Z]/.test(methodScope);
    normalizedDirectScope =
      toolScope ||
      (!methodLooksLikeProcessOnly ? methodScope : "") ||
      compactFocus ||
      compactTheme ||
      "scalable React.js and TypeScript interfaces";
  }
  const activeSupportClause = (() => {
    const lowerScope = normalizedDirectScope.toLocaleLowerCase();
    const remainingTools = explicitTools.filter(
      (keyword) => !lowerScope.includes(keyword.toLocaleLowerCase()),
    );
    const remainingMethods = inferredMethods.filter(
      (keyword) => !lowerScope.includes(keyword.toLocaleLowerCase()),
    );
    return [
      remainingTools.length > 0 ? ` using ${joinNatural(remainingTools)}` : "",
      remainingMethods.length > 0 ? ` through ${joinNatural(remainingMethods)}` : "",
    ].join("");
  })();
  if (/\bdelivery coordination required\b/i.test(normalizedDirectScope)) {
    normalizedDirectScope = normalizedDirectScope.replace(
      /\bdelivery coordination required\b/gi,
      "delivery coordination",
    );
  }
  if (/^(?:stakeholder alignment)\b/i.test(normalizedDirectScope) && /^align/i.test(verb)) {
    normalizedDirectScope =
      "cross-functional priorities with product and engineering stakeholders";
  }
  if (/^(?:real-time communication)\b/i.test(normalizedDirectScope) && /^communicat/i.test(verb)) {
    normalizedDirectScope = "WebSocket-based realtime product updates";
  }

  if (input.plan.communicationFocused) {
    const looksLikeGenericAlignment =
      /^(?:cross[- ]functional alignment|stakeholder alignment|collaboration)$/i.test(
        normalizedDirectScope,
      );
    const looksLikeSoftSkillProse =
      /^(?:strong|excellent|good|proven)\b/i.test(normalizedDirectScope) ||
      /communication skills/i.test(normalizedDirectScope);
    const communicationScope =
      !looksLikeGenericAlignment &&
      !looksLikeSoftSkillProse &&
      /stakeholder|collaborat|product|business|requirements|team|cross-functional|cross-team/i.test(
        normalizedDirectScope,
      )
        ? normalizedDirectScope
        : `cross-functional collaboration with ${compactFocus || "product and engineering stakeholders"}`;
    return stripTerminal(`${verb} ${communicationScope}${activeSupportClause}`);
  }

  if (input.plan.leadershipFocused) {
    const leadershipScope = /strategy|direction|leadership|architecture decision|roadmap/i.test(
      normalizedDirectScope,
    )
      ? normalizedDirectScope
      : `technical direction for ${normalizedDirectScope}`;
    return stripTerminal(`${verb} ${leadershipScope}${activeSupportClause}`);
  }

  if (input.plan.achievementDimension === "mentoring-knowledge-sharing") {
    const mentoringScope = /mentor|coach|knowledge|engineer|onboard/i.test(normalizedDirectScope)
      ? normalizedDirectScope
      : `engineering capability around ${normalizedDirectScope}`;
    return stripTerminal(`${verb} ${mentoringScope}${activeSupportClause}`);
  }

  return stripTerminal(`${verb} ${normalizedDirectScope}${activeSupportClause}`);
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
    .replace(/^made\b/i, "making")
    .replace(/^enabled\b/i, "enabling")
    .replace(/^supported\b/i, "supporting")
    .replace(/^expanded\b/i, "expanding")
    .replace(/^cut\b/i, "cutting")
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
  const normalizedKeyword = stripFirstPersonPronouns(keyword).replace(/[,:;]+$/g, "");
  const exact = normalizedText
    .toLocaleLowerCase()
    .includes(normalizedKeyword.toLocaleLowerCase());
  if (exact) {
    return true;
  }
  const substantive = substantiveKeyword(normalizedKeyword);
  if (!substantive) {
    return true;
  }
  return (
    normalizedText.toLocaleLowerCase().includes(substantive.toLocaleLowerCase()) ||
    containsPhraseConcept(normalizedText, substantive)
  );
}
