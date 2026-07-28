import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarMetric, StarStory } from "../types/star-story";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";
import { cleanScope } from "../star/star-language";
import { joinNatural, lowerFirst } from "../star/star-utils";

const STAR_OWNERSHIP_BOILERPLATE =
  /\b(?:effort to|responsibility to|owned the|took responsibility|delivery planning required|collaboration and delivery planning|collaborative delivery planning|cross-functional collaboration and delivery planning|cross-team product partnership|stakeholder communication loops|requirements discovery with partners|technical direction and cross-team execution)\b/i;

/** Job-post marketing / meta copy that must never become a bullet action object. */
export const JD_MARKETING_PROSE =
  /\b(?:this is a|this (?:role|position|opportunity|part[- ]time)|freelance(?:\s+role)?|part[- ]time(?:\s+remote)?(?:\s+opportunity)?|opportunity opportunity|is ideal for|looking for|we(?:'re| are)\s+(?:looking|hiring|seeking)|you(?:'d|’d|'ll|’ll| will| are| have|ve)\b|you(?:'d|’d)\s+rather|bonus points?(?:\s+if)?|nice[- ]to[- ]have|a plus if|report(?:s|ing)? straight to|report(?:s|ing)? to the|what (?:we|you)(?:'re| are) looking for|about you|our (?:culture|mission|values)|competitive salary|benefits package|join our team|about the (?:role|company|job))\b/i;

/** Emoji / dingbat markers common in informal JD preference lists. */
const JD_META_MARKERS =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]|✅|✓|✔|☐|☑|■|□|●|○|★|☆/u;

/** Finite-verb clauses that read as full JD sentences, not noun scopes. */
const SCOPE_FINITE_VERB =
  /\b(?:connects|enables|helps|allows|provides|offers|supports|delivers|brings|makes|keeps|lets|ensures)\b/i;

export function containsJdMetaMarker(value: string): boolean {
  return JD_META_MARKERS.test(value);
}

export function isJdMarketingOrMetaScope(value: string): boolean {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  if (containsJdMetaMarker(cleaned)) return true;
  if (JD_MARKETING_PROSE.test(cleaned)) return true;
  if (SCOPE_FINITE_VERB.test(cleaned) && cleaned.split(/\s+/).length >= 5) {
    return true;
  }
  // Truncated hiring copy often ends mid-phrase on "for technical/product/..."
  if (/\b(?:ideal for|role for a|opportunity for)\b/i.test(cleaned)) {
    return true;
  }
  // Second-person hiring fragments that survive partial extraction.
  if (
    /\b(?:you'?d|you’ll|you'll|you will|you are|you have|you’ve|you've)\b/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  if (/\bbonus points?\b/i.test(cleaned) || /\brather have\b/i.test(cleaned)) {
    return true;
  }
  return false;
}

/** Strip emoji / hiring meta crumbs left in composed bullet text. */
export function scrubJdMetaFromVisibleText(value: string): string {
  return value
    .replace(JD_META_MARKERS, " ")
    // Prefer short, local removals so metrics and concrete work survive.
    .replace(/\bbonus points?(?:\s+if(?:\s+you(?:'ve|’ve| have)?)?)?\b/gi, " ")
    .replace(/\byou(?:'d|’d)\s+rather(?:\s+have)?(?:\s+\w+){0,4}\b/gi, " ")
    .replace(
      /\b(?:you(?:'d|’d|'ll|’ll| will)\s+)?report(?:s|ing)?(?:\s+straight)?\s+to(?:\s+the)?(?:\s+\w+){0,4}\b/gi,
      " ",
    )
    .replace(/\bcovering\s+(?=,|\s*$)/gi, " ")
    .replace(/\byou(?:'d|’d|'ll|’ll| will| are| have|ve|’ve)\b(?:\s+\w+){0,6}/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s+(?=[,.])/g, "")
    .trim();
}

const COMMUNICATION_SCOPE_VARIANTS = [
  "cross-functional collaboration with product and engineering stakeholders",
  "product and engineering partnership on delivery priorities",
  "stakeholder communication across product and platform teams",
  "requirements alignment with product and business partners",
  "cross-team delivery planning with product stakeholders",
  "architecture workshops with product and engineering stakeholders",
] as const;

/**
 * Evidence that a communication-focused bullet still carries stakeholder or
 * collaboration wording after composition/compression.
 */
export const COMPOSITION_COMMUNICATION_SIGNAL =
  /stakeholder|cross-functional|cross-team|product|business|alignment|requirements|team|collaborat|communicat|partner|facilitat|coordinat|\balign(?:ed|ing|s)?\b/i;

const COMMUNICATION_SIGNAL_PHRASE =
  "with product and engineering stakeholders";

export function hasCompositionCommunicationSignal(text: string): boolean {
  return COMPOSITION_COMMUNICATION_SIGNAL.test(text);
}

/**
 * Re-injects a compact collaboration phrase when shortening, Align/coordination
 * echo rewrites, or scope uniqueness would otherwise leave a communication
 * bullet without stakeholder/collaboration evidence.
 */
export function ensureCompositionCommunicationSignal(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || hasCompositionCommunicationSignal(trimmed)) {
    return trimmed;
  }
  const endsWithPeriod = /[.!?]$/.test(trimmed);
  const body = trimmed.replace(/[.!?]+$/g, "").trim();
  let repaired = body;
  if (/\b(?:using|through)\b/i.test(body)) {
    repaired = body.replace(
      /\b(using|through)\b/i,
      `${COMMUNICATION_SIGNAL_PHRASE} $1`,
    );
  } else if (/,/.test(body)) {
    repaired = body.replace(",", ` ${COMMUNICATION_SIGNAL_PHRASE},`);
  } else {
    repaired = `${body} ${COMMUNICATION_SIGNAL_PHRASE}`;
  }
  repaired = repaired.replace(/\s+/g, " ").trim();
  return endsWithPeriod ? `${repaired}.` : repaired;
}

/** Short uniqueness qualifiers — never expose internal bullet IDs. */
const UNIQUE_SCOPE_QUALIFIERS = [
  "across production systems",
  "for platform delivery",
  "in release workflows",
  "across critical services",
  "for customer workloads",
  "during peak demand",
  "across distributed services",
  "for operational readiness",
] as const;

function hashSeed(seed: string): number {
  return Math.abs(
    [...seed].reduce((hash, char) => hash + char.charCodeAt(0), 0),
  );
}

function isUsedScope(scope: string, usedScopeKeys?: ReadonlySet<string>): boolean {
  if (!usedScopeKeys || usedScopeKeys.size === 0) {
    return false;
  }
  const key = canonicalKeywordKey(substantiveKeyword(scope));
  if (key && usedScopeKeys.has(key)) {
    return true;
  }
  const words = scope.split(/\s+/).filter(Boolean);
  for (let index = 0; index < words.length - 2; index += 1) {
    const windowKey = canonicalKeywordKey(
      substantiveKeyword(words.slice(index, index + 3).join(" ")),
    );
    if (windowKey && usedScopeKeys.has(windowKey)) {
      return true;
    }
  }
  return false;
}

function uniqueScopedPhrase(
  base: string,
  seed: string,
  usedScopeKeys?: ReadonlySet<string>,
): string {
  const cleanedBase =
    base.replace(/\s+/g, " ").trim() || "production delivery outcomes";
  const candidates = [
    cleanedBase,
    ...UNIQUE_SCOPE_QUALIFIERS.map(
      (qualifier) => `${cleanedBase} ${qualifier}`,
    ),
  ];
  const unused = candidates.find(
    (candidate) => !isUsedScope(candidate, usedScopeKeys),
  );
  if (unused) {
    return unused;
  }
  const index = hashSeed(seed) % UNIQUE_SCOPE_QUALIFIERS.length;
  // Keep the last-resort phrase compact so supporting methods remain representable.
  return `${cleanedBase} ${UNIQUE_SCOPE_QUALIFIERS[index]}`;
}

function pickUnusedCommunicationScope(
  preferred: string | undefined,
  usedScopeKeys: ReadonlySet<string> | undefined,
  seed: string,
): string {
  const candidates = [
    preferred,
    ...COMMUNICATION_SCOPE_VARIANTS,
  ].filter((value): value is string => Boolean(value?.trim()));
  const unused = candidates.find((candidate) => !isUsedScope(candidate, usedScopeKeys));
  if (unused) {
    return unused;
  }
  // Deterministic last-resort variant so concurrent roles never share one clone.
  // Never append internal identifiers such as exp-001-b-004 into visible text.
  const index = hashSeed(seed) % COMMUNICATION_SCOPE_VARIANTS.length;
  return uniqueScopedPhrase(
    COMMUNICATION_SCOPE_VARIANTS[index]!,
    seed,
    usedScopeKeys,
  );
}

/** Visible action-object text used for document-wide scope uniqueness. */
export function extractActionObjectScope(bulletText: string, actionVerb?: string): string {
  let text = stripFirstPersonPronouns(bulletText).replace(/[.!?]+$/g, "").trim();
  if (actionVerb) {
    text = text.replace(new RegExp(`^${actionVerb}\\s+`, "i"), "").trim();
  } else {
    text = text.replace(/^[A-Za-z-]+\s+/, "").trim();
  }
  return text
    .replace(/\s+(?:using|through|,)\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    scrubJdMetaFromVisibleText(
      value
        .replace(WEAK_FILLER, "")
        // Resume Worded flags bare soft-skill buzzphrases; swap for concrete signal.
        .replace(
          /\b(?:strong|excellent|good|proven)\s+(?:verbal and written\s+)?communication skills\b/gi,
          "stakeholder communication",
        )
        .replace(/\b(?:verbal and written\s+)?communication skills\b/gi, "stakeholder communication")
        .replace(/\b(?:soft skills|interpersonal skills|people skills)\b/gi, "cross-functional collaboration")
        // Never leave internal plan identifiers in visible resume text.
        .replace(/\bfor\s+exp-\d+-b-\d+\b/gi, " across production systems")
        .replace(/\bexp-\d+-b-\d+\b/gi, "production systems")
        .replace(/\s+,/g, ",")
        .replace(/,\s*,+/g, ", ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.!?]+$/g, ""),
    ),
  );
  if (!normalized) {
    return "";
  }
  const withoutEcho = stripIntraBulletRepetition(normalized);
  const cleaned = withoutEcho.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

/** Morphological stem used to catch Coordinated/coordination style echoes. */
export function actionVerbStem(verb: string): string {
  return verb
    .trim()
    .toLocaleLowerCase()
    .replace(/(?:iated|ated|ized|ised|yed|ied|ed|ing|es|s)$/i, "")
    .replace(/i$/i, "y");
}

/**
 * Removes only clear verb/object tautologies and duplicated measure nouns.
 * Avoid broad stem deletion so allocated supporting methods remain representable.
 */
export function stripIntraBulletRepetition(sentence: string): string {
  let text = sentence.replace(/[.!?]+$/g, "").trim();

  // Coordinated/Aligned/Automated ... delivery coordination → keep a collaboration signal.
  text = text.replace(
    /\b(Coordinat(?:e|es|ed|ing)|Align(?:s|ed|ing)?|Automat(?:e|es|ed|ing))\b([^]*?)\b(?:stakeholder\s+)?(?:alignment and\s+)?delivery\s+coordination\b/i,
    "$1$2 cross-functional delivery priorities",
  );
  text = text.replace(
    /\b(Coordinat(?:e|es|ed|ing))\b([^]*?)\bdependency\s+coordination\b/gi,
    "$1$2 dependency planning",
  );
  text = text.replace(
    /\b(Coordinat(?:e|es|ed|ing))\b([^]*?)\bcoordination\b/gi,
    "$1$2 collaboration",
  );
  text = text.replace(
    /\b(Align(?:s|ed|ing)?)\b([^]*?)\balignment\b/gi,
    "$1$2 cross-functional priorities",
  );
  text = text.replace(
    /\b(Mentor(?:s|ed|ing)?)\b([^]*?)\bmentoring\b/gi,
    "$1$2 capability building",
  );

  // "increasing throughput by 2.6x and improving request throughput"
  text = text.replace(
    /\b(increasing|reducing|maintaining|improving|accelerating|shortening)\s+([^,]+?)\s+by\s+(\d+(?:\.\d+)?(?:%|x))\s+and\s+(?:improving|advancing|strengthening)\s+(?:[a-z][a-z0-9+./-]*\s+)?\2\b/gi,
    "$1 $2 by $3",
  );
  text = text.replace(
    /\b(increasing|reducing|maintaining|improving|accelerating|shortening)\s+(\w+)\s+by\s+(\d+(?:\.\d+)?(?:%|x))\s+and\s+(?:improving|advancing|strengthening)\s+\w+\s+\2\b/gi,
    "$1 $2 by $3",
  );

  return text.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*,+/g, ", ").trim();
}

export function substantiveKeyword(keyword: string): string {
  if (/^mentor(?:ed|ing|s)?\s+engineers?\b/i.test(keyword.trim())) {
    return "engineer mentoring";
  }
  const cleaned = cleanScope(stripFirstPersonPronouns(keyword))
    .replace(
      /^(?:experience|proficiency|knowledge|expertise|familiarity)\s+(?:with|in|of|using)\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  // Convert leftover imperative openings into noun scopes when cleanScope kept
  // the original phrase (e.g. short remnants).
  const asNounScope = cleaned
    .replace(/^(?:collaborate|collaborating)\s+with\b/i, "collaboration with")
    .replace(
      /^(?:communicate|communicating)\s+(?:with|to|across)\b/i,
      "communication with",
    )
    .replace(/\s+/g, " ")
    .trim();
  const withoutSeniority = asNounScope
    .replace(/^(?:entry[- ]level|junior|mid[- ]level|senior|lead|staff|principal|chief)\s+/i, "")
    .replace(/\s+(?:engineer|developer|scientist|architect|manager|specialist|analyst)$/i, "")
    .trim();
  const phrase = withoutSeniority || asNounScope || cleaned || stripTerminal(keyword);
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
  usedScopeKeys?: ReadonlySet<string>;
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
  const compactFocusRaw =
    focusScope.split(/\s+/).filter(Boolean).length > 0 &&
    focusScope.split(/\s+/).length <= 8 &&
    !/,| and | through /i.test(focusScope)
      ? focusScope
      : "";
  const compactFocusSanitized = compactFocusRaw
    .replace(
      /^(?:experience|proficiency|knowledge|expertise|familiarity)\s+(?:with|in|of|using)\s+/i,
      "",
    )
    .replace(/[.]+$/g, "")
    .trim();
  const compactFocus =
    compactFocusSanitized && !isJdMarketingOrMetaScope(compactFocusSanitized)
      ? compactFocusSanitized
      : "";
  const compactThemeRaw =
    themeScope.split(/\s+/).filter(Boolean).length > 0 &&
    themeScope.split(/\s+/).length <= 6
      ? themeScope
      : "";
  const compactThemeSanitized = compactThemeRaw
    .replace(
      /^(?:experience|proficiency|knowledge|expertise|familiarity)\s+(?:with|in|of|using)\s+/i,
      "",
    )
    .replace(
      /^production implementation and delivery for\s+/i,
      "",
    )
    .replace(/[.]+$/g, "")
    .trim();
  const compactTheme =
    compactThemeSanitized &&
    compactThemeSanitized.split(/\s+/).length <= 8 &&
    !isJdMarketingOrMetaScope(compactThemeSanitized) &&
    !/^experience with\b/i.test(compactThemeSanitized)
      ? compactThemeSanitized
      : "";
  const compactTaskRaw = substantiveKeyword(input.story.task)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
    .replace(/\brequired\b$/i, "")
    .trim();
  // STAR ownership boilerplate is not a usable action object.
  const compactTask =
    compactTaskRaw &&
    !STAR_OWNERSHIP_BOILERPLATE.test(compactTaskRaw) &&
    !isJdMarketingOrMetaScope(compactTaskRaw)
      ? compactTaskRaw
      : "";
  // Never fall back to bare achievement-dimension labels such as
  // "cross functional alignment" or "reliability observability" — those clone
  // across roles whenever the same dimension is reused.
  const shortFallback =
    compactFocus ||
    compactTheme ||
    compactTask ||
    "production delivery outcomes";
  const cleanFallback = (() => {
    const toolScope = joinNatural(
      input.keywordPackage.supportingKeywords
        .map(stripFirstPersonPronouns)
        .filter(Boolean)
        .slice(0, 2),
    );
    if (toolScope) return toolScope;
    if (compactFocus) return compactFocus;
    if (compactTheme) return compactTheme;
    return "production delivery outcomes";
  })();
  const directScope =
    joinedDirectScope.split(/\s+/).filter(Boolean).length >= 2 &&
    !isJdMarketingOrMetaScope(joinedDirectScope)
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
    /^production(?:\s+\w+)?\s+delivery outcomes$/i.test(normalizedDirectScope) ||
    STAR_OWNERSHIP_BOILERPLATE.test(normalizedDirectScope) ||
    isJdMarketingOrMetaScope(normalizedDirectScope)
  ) {
    const toolScope = joinNatural(explicitTools.slice(0, 2));
    const methodScope = joinNatural(inferredMethods.slice(0, 2));
    const methodLooksLikeProcessOnly =
      /^(?:solution design|design reviews|technical documentation|delivery planning|architecture workshops)\b/i.test(
        methodScope,
      ) || (/ and /i.test(methodScope) && !/[A-Z]/.test(methodScope));
    // Keep this fallback domain-neutral. A React/TypeScript hardcode leaks
    // frontend stack into unrelated concurrent generations (e.g. ML resumes).
    // Never reintroduce STAR task boilerplate via shortFallback.
    normalizedDirectScope =
      toolScope ||
      (!methodLooksLikeProcessOnly ? methodScope : "") ||
      compactFocus ||
      compactTheme ||
      cleanFallback;
  }
  if (/^experience with\b/i.test(normalizedDirectScope)) {
    const withoutPrefix = normalizedDirectScope
      .replace(/^experience with\s+/i, "")
      .replace(/[.]+$/g, "")
      .trim();
    const toolScope = joinNatural(explicitTools.slice(0, 2));
    // Never fall back to compactFocus/theme here — those may still carry the
    // "Experience with …" requirement label and reintroduce it.
    normalizedDirectScope =
      withoutPrefix ||
      toolScope ||
      cleanFallback ||
      "production delivery outcomes";
  }
  if (/\b(?:the effort to|took responsibility to)\b/i.test(normalizedDirectScope)) {
    normalizedDirectScope = cleanFallback;
  }
  // Avoid "Coordinated/Aligned/Automated ... delivery coordination" tautologies.
  if (/^(?:coordinat|align|automat)/i.test(verb)) {
    normalizedDirectScope = normalizedDirectScope
      .replace(
        /\bstakeholder alignment and delivery coordination\b/gi,
        "cross-functional delivery priorities",
      )
      .replace(/\bdelivery coordination\b/gi, "delivery priorities")
      .replace(/\bcoordination\b/gi, "collaboration");
  }
  if (/^align/i.test(verb)) {
    normalizedDirectScope = normalizedDirectScope
      .replace(/\bstakeholder alignment\b/gi, "cross-functional priorities")
      .replace(/\balignment\b/gi, "cross-functional priorities");
  }
  const filteredMethods = inferredMethods.map((keyword) => {
    if (/^(?:coordinat|automat)/i.test(verb) && /\bcoordination\b/i.test(keyword)) {
      return keyword.replace(/\bcoordination\b/gi, "planning");
    }
    if (/^align/i.test(verb) && /\balignment\b/i.test(keyword)) {
      const rewritten = keyword.replace(/\balignment\b/gi, "planning");
      return hasCompositionCommunicationSignal(rewritten)
        ? rewritten
        : "cross-functional planning";
    }
    return keyword;
  });
  const buildSupportClause = (scopeText: string): string => {
    const lowerScope = scopeText.toLocaleLowerCase();
    const remainingTools = explicitTools.filter(
      (keyword) => !lowerScope.includes(keyword.toLocaleLowerCase()),
    );
    const remainingMethods = filteredMethods.filter(
      (keyword) => !lowerScope.includes(keyword.toLocaleLowerCase()),
    );
    return [
      remainingTools.length > 0 ? ` using ${joinNatural(remainingTools)}` : "",
      remainingMethods.length > 0 ? ` through ${joinNatural(remainingMethods)}` : "",
    ].join("");
  };
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
      /^(?:cross[- ]functional alignment|stakeholder alignment|collaboration|cross-functional delivery priorities|delivery priorities)\b/i.test(
        normalizedDirectScope,
      ) ||
      /\bstakeholder alignment and delivery (?:coordination|priorities)\b/i.test(
        normalizedDirectScope,
      ) ||
      STAR_OWNERSHIP_BOILERPLATE.test(normalizedDirectScope) ||
      isUsedScope(normalizedDirectScope, input.usedScopeKeys);
    const looksLikeSoftSkillProse =
      /^(?:strong|excellent|good|proven)\b/i.test(normalizedDirectScope) ||
      /communication skills/i.test(normalizedDirectScope);
    // Supporting methods must stay in the "through" clause — never promote them
    // to the action object for communication bullets, or they disappear when the
    // scope is replaced with a collaboration variant.
    const looksLikeSupportingAsScope =
      filteredMethods.length > 0 &&
      filteredMethods.every((keyword) =>
        normalizedDirectScope.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()),
      );
    const preferredScope =
      !looksLikeGenericAlignment &&
      !looksLikeSoftSkillProse &&
      !looksLikeSupportingAsScope &&
      /stakeholder|collaborat|product|business|requirements|team|cross-functional|cross-team/i.test(
        normalizedDirectScope,
      )
        ? normalizedDirectScope
        : undefined;
    const communicationScope = pickUnusedCommunicationScope(
      preferredScope,
      input.usedScopeKeys,
      input.plan.bulletId,
    );
    return ensureCompositionCommunicationSignal(
      stripTerminal(
        `${verb} ${communicationScope}${buildSupportClause(communicationScope)}`,
      ),
    );
  }

  if (input.plan.leadershipFocused) {
    const leadershipScope = /strategy|direction|leadership|architecture decision|roadmap/i.test(
      normalizedDirectScope,
    )
      ? normalizedDirectScope
      : `technical direction for ${normalizedDirectScope}`;
    return stripTerminal(
      `${verb} ${leadershipScope}${buildSupportClause(leadershipScope)}`,
    );
  }

  if (input.plan.achievementDimension === "mentoring-knowledge-sharing") {
    let mentoringScope = /mentor|coach|knowledge|engineer|onboard/i.test(normalizedDirectScope)
      ? normalizedDirectScope
      : `engineering capability around ${normalizedDirectScope}`;
    if (/^mentor/i.test(verb) && /\bmentoring\b/i.test(mentoringScope)) {
      mentoringScope = mentoringScope
        .replace(/\bmentoring\b/gi, "capability building")
        .replace(/\s+/g, " ")
        .trim();
    }
    return stripTerminal(
      `${verb} ${mentoringScope}${buildSupportClause(mentoringScope)}`,
    );
  }

  // Non-communication bullets also avoid cloning a previously used action object.
  if (isUsedScope(normalizedDirectScope, input.usedScopeKeys)) {
    const methodScope = joinNatural(filteredMethods.slice(0, 2));
    const toolScope = joinNatural(explicitTools.slice(0, 2));
    normalizedDirectScope =
      [toolScope, compactFocus]
        .find(
          (candidate) =>
            Boolean(candidate) && !isUsedScope(candidate, input.usedScopeKeys),
        ) ||
      uniqueScopedPhrase(
        cleanFallback,
        input.plan.bulletId,
        input.usedScopeKeys,
      );
    // Prefer not to consume methods as the object when we can keep them in "through".
    if (methodScope && normalizedDirectScope === methodScope) {
      normalizedDirectScope =
        compactFocus ||
        toolScope ||
        uniqueScopedPhrase(
          cleanFallback,
          input.plan.bulletId,
          input.usedScopeKeys,
        );
    }
  }

  return stripTerminal(
    `${verb} ${normalizedDirectScope}${buildSupportClause(normalizedDirectScope)}`,
  );
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

function isNearDuplicateMeasurePhrase(keyword: string, measure: string): boolean {
  const keywordLower = keyword.toLocaleLowerCase().trim();
  const measureLower = measure.toLocaleLowerCase().trim();
  if (!keywordLower || !measureLower) {
    return false;
  }
  if (keywordLower === measureLower) {
    return true;
  }
  // "request throughput" restates measure "throughput"; keep "deployment speed"
  // when the measure is the related but distinct "deployment cycle time".
  if (measureLower.includes(keywordLower) || keywordLower.includes(measureLower)) {
    return true;
  }
  const keywordTokens = keywordLower
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length > 2);
  const measureTokens = new Set(
    measureLower.split(/[^a-z0-9+#.]+/).filter((token) => token.length > 2),
  );
  if (keywordTokens.length === 0 || measureTokens.size === 0) {
    return false;
  }
  if (keywordTokens.every((token) => measureTokens.has(token)) && keywordTokens.length >= 2) {
    return true;
  }
  // Shared primary nouns like "velocity" / "throughput" still read as restatement
  // ("team delivery velocity" + "engineering velocity").
  const primaryNouns = [
    "velocity",
    "throughput",
    "adoption",
    "latency",
    "reliability",
    "availability",
    "predictability",
  ];
  return primaryNouns.some(
    (noun) => keywordTokens.includes(noun) && measureTokens.has(noun),
  );
}

export function uncoveredOutcomeKeywords(input: {
  actionClause: string;
  metrics: readonly StarMetric[];
  keywordPackage: KeywordPackage;
}): string[] {
  const measures = input.metrics.map((metric) => metric.measure);
  const coveredText = stripFirstPersonPronouns(
    `${input.actionClause} ${input.metrics
      .map((metric) => `${metric.displayText} ${metric.measure}`)
      .join(" ")}`,
  ).toLocaleLowerCase();
  return uniquePhrases(
    input.keywordPackage.outcomeKeywords.map(stripFirstPersonPronouns),
  ).filter((keyword) => {
    if (!keyword) return false;
    const lower = keyword.toLocaleLowerCase();
    if (coveredText.includes(lower)) return false;
    if (measures.some((measure) => isNearDuplicateMeasurePhrase(keyword, measure))) {
      return false;
    }
    return true;
  });
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
