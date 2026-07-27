import type { BulletPlanItem } from "../types/bullet-plan";
import type {
  BulletSentencePattern,
} from "../types/composed-bullet";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarStory } from "../types/star-story";
import { joinNatural } from "../star/star-utils";
import {
  businessImpactAsGerund,
  businessImpactAsInfinitive,
  compactBusinessImpact,
  metricAsGerund,
  metricAsNoun,
  normalizeBulletSentence,
  stripFirstPersonPronouns,
  substantiveKeyword,
  uncoveredOutcomeKeywords,
  wordCount,
} from "./bullet-language";

const GENERAL_PATTERNS: readonly BulletSentencePattern[] = [
  "action-metric-outcome",
  "action-outcome-metric",
  "action-metric-while-outcome",
  "action-delivered-impact",
];

const WHILE_CONNECTORS = [
  "while advancing",
  "while strengthening",
  "while supporting",
] as const;

const DELIVERED_CONNECTORS = [
  "that improved",
  "and strengthening",
  "while reinforcing",
] as const;

function patternForPlan(plan: BulletPlanItem, patternOffset = 0): BulletSentencePattern {
  if (plan.communicationFocused || plan.leadershipFocused) {
    return "action-metric-business-impact";
  }
  return GENERAL_PATTERNS[(Math.max(1, plan.sequence) - 1 + Math.max(0, patternOffset)) % GENERAL_PATTERNS.length]
    ?? "action-metric-outcome";
}

function pickVariant(
  options: readonly string[],
  seed: string,
  used: ReadonlySet<string> | undefined,
): string {
  const start =
    Math.abs([...seed].reduce((hash, char) => hash + char.charCodeAt(0), 0)) %
    options.length;
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(start + offset) % options.length]!;
    if (!used?.has(candidate)) {
      return candidate;
    }
  }
  return options[start]!;
}

function outcomePhrase(
  actionClause: string,
  story: StarStory,
  keywordPackage: KeywordPackage,
): string {
  const uncovered = uncoveredOutcomeKeywords({
    actionClause,
    metrics: story.metrics,
    keywordPackage,
  });
  return joinNatural(uncovered);
}

/** Trailing formula fingerprint used to stop "cycle time while advancing" clones. */
export function endingSkeleton(bulletText: string): string {
  const tail = bulletText
    .toLocaleLowerCase()
    .replace(/[.!?]+$/g, "")
    .split(/,\s+/)
    .slice(-1)[0] ?? bulletText;
  return tail
    .replace(/\b\d+(?:\.\d+)?\s?(?:%|x)\b/gi, "<metric>")
    .replace(/\b(?:a|an|the|in|by|and|while|to|for|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWithPattern(input: {
  actionClause: string;
  plan: BulletPlanItem;
  keywordPackage: KeywordPackage;
  story: StarStory;
  pattern: BulletSentencePattern;
  includeBusinessImpact: boolean;
  usedConnectors?: ReadonlySet<string>;
}): { text: string; connectors: string[] } {
  const metric = input.story.metrics[0];
  if (!metric) {
    throw new Error(`Bullet ${input.plan.bulletId} has no measurable STAR result.`);
  }
  const metricGerund = metricAsGerund(metric);
  const metricNoun = metricAsNoun(metric);
  const outcomes = outcomePhrase(input.actionClause, input.story, input.keywordPackage);
  const businessObject = compactBusinessImpact(input.story);
  const businessGerund = businessImpactAsGerund(input.story);
  const businessInfinitive = businessImpactAsInfinitive(input.story);
  const connectors: string[] = [];

  switch (input.pattern) {
    case "action-outcome-metric":
      return {
        text: normalizeBulletSentence(
          outcomes
            ? `${input.actionClause} to strengthen ${outcomes}, ${metricGerund}`
            : `${input.actionClause} to ${businessInfinitive}, ${metricGerund}`,
        ),
        connectors,
      };
    case "action-metric-while-outcome": {
      const connector = pickVariant(
        WHILE_CONNECTORS,
        `${input.plan.bulletId}:while`,
        input.usedConnectors,
      );
      connectors.push(connector);
      return {
        text: normalizeBulletSentence(
          outcomes
            ? `${input.actionClause}, ${metricGerund} ${connector} ${outcomes}`
            : `${input.actionClause}, ${metricGerund} while ${businessGerund}`,
        ),
        connectors,
      };
    }
    case "action-delivered-impact": {
      const connector = pickVariant(
        DELIVERED_CONNECTORS,
        `${input.plan.bulletId}:delivered`,
        input.usedConnectors,
      );
      connectors.push(connector);
      return {
        text: normalizeBulletSentence(
          outcomes
            ? `${input.actionClause}, delivering ${metricNoun} ${connector} ${outcomes}`
            : `${input.actionClause}, delivering ${metricNoun} while ${businessGerund}`,
        ),
        connectors,
      };
    }
    case "action-metric-business-impact": {
      // Avoid cloning the same outcome in both "improving X" and "enabling better X".
      if (outcomes) {
        return {
          text: normalizeBulletSentence(
            `${input.actionClause}, ${metricGerund} and improving ${outcomes}`,
          ),
          connectors,
        };
      }
      const impact =
        businessObject || input.plan.achievementTheme || "delivery outcomes";
      return {
        text: normalizeBulletSentence(
          `${input.actionClause}, ${metricGerund}, enabling ${impact}`,
        ),
        connectors,
      };
    }
    case "action-metric-outcome":
    default:
      return {
        text: normalizeBulletSentence(
          outcomes
            ? `${input.actionClause}, ${metricGerund} and improving ${outcomes}`
            : `${input.actionClause}, ${metricGerund} and ${businessGerund}`,
        ),
        connectors,
      };
  }
}

function requiredPhrases(keywordPackage: KeywordPackage): string[] {
  const directPhrases = keywordPackage.directKeywords
    .map((keyword) => substantiveKeyword(stripFirstPersonPronouns(keyword)))
    .filter(Boolean);
  return [
    ...directPhrases,
    ...keywordPackage.supportingKeywords.map(stripFirstPersonPronouns),
    ...keywordPackage.outcomeKeywords.map(stripFirstPersonPronouns),
  ].filter(Boolean);
}

function containsPhrase(text: string, phrase: string): boolean {
  return text.toLocaleLowerCase().includes(phrase.toLocaleLowerCase());
}

function shortenActionClause(
  actionClause: string,
  maximumWords: number,
  preserve: readonly string[] = [],
): string {
  const tokens = stripFirstPersonPronouns(actionClause).split(/\s+/).filter(Boolean);
  if (tokens.length <= maximumWords) {
    return tokens.join(" ");
  }

  let shortened = tokens.slice(0, maximumWords).join(" ");
  for (const phrase of preserve) {
    if (!phrase || containsPhrase(shortened, phrase)) {
      continue;
    }
    const phraseTokens = phrase.split(/\s+/).filter(Boolean);
    if (phraseTokens.length === 0 || phraseTokens.length >= maximumWords) {
      continue;
    }
    const keep = Math.max(4, maximumWords - phraseTokens.length - 1);
    shortened = [...tokens.slice(0, keep), ...phraseTokens]
      .slice(0, maximumWords)
      .join(" ");
  }
  return shortened;
}

function compressToMaximumWords(
  text: string,
  maximumWords: number,
  preserve: readonly string[],
): string {
  const cleaned = stripFirstPersonPronouns(text.replace(/[.!?]+$/g, "").trim());
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= maximumWords) {
    return normalizeBulletSentence(cleaned);
  }

  // Keep the trailing metric/result clause intact when possible.
  const segments = cleaned.split(/,\s+/);
  if (segments.length >= 2) {
    const tail = segments.slice(-2).join(", ");
    const headBudget = Math.max(8, maximumWords - wordCount(tail) - 1);
    const head = shortenActionClause(segments.slice(0, -2).join(", ") || segments[0] || "", headBudget);
    const rebuilt = normalizeBulletSentence([head, ...segments.slice(-2)].filter(Boolean).join(", "));
    if (
      wordCount(rebuilt) <= maximumWords &&
      preserve.every((phrase) => !phrase || containsPhrase(rebuilt, phrase))
    ) {
      return rebuilt;
    }
  }

  let compressed = tokens.slice(0, maximumWords).join(" ");
  for (const phrase of preserve) {
    if (!phrase || containsPhrase(compressed, phrase)) {
      continue;
    }
    const phraseTokens = phrase.split(/\s+/).filter(Boolean);
    const keep = Math.max(6, maximumWords - phraseTokens.length - 1);
    compressed = [...tokens.slice(0, keep), ...phraseTokens]
      .slice(0, maximumWords)
      .join(" ");
  }
  return normalizeBulletSentence(compressed);
}

function buildCandidates(input: {
  actionClause: string;
  plan: BulletPlanItem;
  keywordPackage: KeywordPackage;
  story: StarStory;
  patternOffset?: number;
  usedConnectors?: ReadonlySet<string>;
  usedEndingSkeletons?: ReadonlySet<string>;
}): Array<{ finalBullet: string; sentencePattern: BulletSentencePattern; connectors: string[] }> {
  const preferredPattern = patternForPlan(input.plan, input.patternOffset ?? 0);
  const candidatePatterns: BulletSentencePattern[] = [
    preferredPattern,
    ...GENERAL_PATTERNS,
    "action-metric-business-impact",
  ];
  const uniquePatterns = [...new Set(candidatePatterns)];
  return uniquePatterns.flatMap((pattern) => {
    const withImpact = buildWithPattern({
      ...input,
      pattern,
      includeBusinessImpact: true,
    });
    const withoutImpact = buildWithPattern({
      ...input,
      pattern,
      includeBusinessImpact: false,
    });
    return [
      { finalBullet: withImpact.text, sentencePattern: pattern, connectors: withImpact.connectors },
      { finalBullet: withoutImpact.text, sentencePattern: pattern, connectors: withoutImpact.connectors },
    ];
  });
}

export class SentencePatternEngine {
  compose(input: {
    actionClause: string;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    story: StarStory;
    maximumWords: number;
    minimumWords?: number;
    patternOffset?: number;
    usedConnectors?: ReadonlySet<string>;
    usedEndingSkeletons?: ReadonlySet<string>;
  }): { finalBullet: string; sentencePattern: BulletSentencePattern; connectors: string[] } {
    const minimumWords = input.minimumWords ?? 16;
    const preferredPattern = patternForPlan(input.plan, input.patternOffset ?? 0);
    const preserve = requiredPhrases(input.keywordPackage);
    const actionBudgets = [
      wordCount(input.actionClause),
      Math.max(10, input.maximumWords - 16),
      Math.max(8, input.maximumWords - 20),
    ];

    const candidates = actionBudgets.flatMap((budget) => {
      const actionClause = shortenActionClause(
        input.actionClause,
        budget,
        preserve,
      );
      return buildCandidates({
        ...input,
        actionClause,
      });
    });

    const valid = candidates.filter((candidate) => {
      const count = wordCount(candidate.finalBullet);
      const skeleton = endingSkeleton(candidate.finalBullet);
      const endingFree =
        !input.usedEndingSkeletons ||
        input.usedEndingSkeletons.size === 0 ||
        !input.usedEndingSkeletons.has(skeleton);
      return (
        count >= minimumWords &&
        count <= input.maximumWords &&
        endingFree &&
        preserve.every((phrase) => !phrase || containsPhrase(candidate.finalBullet, phrase))
      );
    });
    if (valid.length > 0) {
      const preferred =
        valid.find((candidate) => candidate.sentencePattern === preferredPattern) ??
        valid[0]!;
      return preferred;
    }

    // Fall back without ending uniqueness if every candidate collides.
    const lengthValid = candidates.filter((candidate) => {
      const count = wordCount(candidate.finalBullet);
      return (
        count >= minimumWords &&
        count <= input.maximumWords &&
        preserve.every((phrase) => !phrase || containsPhrase(candidate.finalBullet, phrase))
      );
    });
    if (lengthValid.length > 0) {
      return (
        lengthValid.find((candidate) => candidate.sentencePattern === preferredPattern) ??
        lengthValid[0]!
      );
    }

    const shortest = [...candidates].sort(
      (left, right) =>
        wordCount(left.finalBullet) - wordCount(right.finalBullet),
    )[0];
    if (shortest) {
      const compressed = compressToMaximumWords(
        shortest.finalBullet,
        input.maximumWords,
        preserve,
      );
      if (wordCount(compressed) >= minimumWords) {
        return {
          finalBullet: compressed,
          sentencePattern: shortest.sentencePattern,
          connectors: shortest.connectors,
        };
      }
    }

    const base =
      candidates.find((candidate) => candidate.sentencePattern === preferredPattern)
        ?.finalBullet ?? candidates[0]?.finalBullet ?? "";
    return {
      finalBullet: compressToMaximumWords(
        `${base.replace(/[.!?]+$/g, "")}, enabling stronger delivery outcomes for product and engineering stakeholders`,
        input.maximumWords,
        preserve,
      ),
      sentencePattern: preferredPattern,
      connectors: [],
    };
  }
}
