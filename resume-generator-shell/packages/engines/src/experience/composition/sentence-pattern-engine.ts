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
  uncoveredOutcomeKeywords,
  wordCount,
} from "./bullet-language";

const GENERAL_PATTERNS: readonly BulletSentencePattern[] = [
  "action-metric-outcome",
  "action-outcome-metric",
  "action-metric-while-outcome",
  "action-delivered-impact",
];

function patternForPlan(plan: BulletPlanItem, patternOffset = 0): BulletSentencePattern {
  if (plan.communicationFocused || plan.leadershipFocused) {
    return "action-metric-business-impact";
  }
  return GENERAL_PATTERNS[(Math.max(1, plan.sequence) - 1 + Math.max(0, patternOffset)) % GENERAL_PATTERNS.length]
    ?? "action-metric-outcome";
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

function buildWithPattern(input: {
  actionClause: string;
  plan: BulletPlanItem;
  keywordPackage: KeywordPackage;
  story: StarStory;
  pattern: BulletSentencePattern;
  includeBusinessImpact: boolean;
}): string {
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

  switch (input.pattern) {
    case "action-outcome-metric":
      return normalizeBulletSentence(
        outcomes
          ? `${input.actionClause} to strengthen ${outcomes}, ${metricGerund}`
          : `${input.actionClause} to ${businessInfinitive}, ${metricGerund}`,
      );
    case "action-metric-while-outcome":
      return normalizeBulletSentence(
        outcomes
          ? `${input.actionClause}, ${metricGerund} while advancing ${outcomes}`
          : `${input.actionClause}, ${metricGerund} while ${businessGerund}`,
      );
    case "action-delivered-impact":
      return normalizeBulletSentence(
        outcomes
          ? `${input.actionClause}, delivering ${metricNoun} while advancing ${outcomes}`
          : `${input.actionClause}, delivering ${metricNoun} while ${businessGerund}`,
      );
    case "action-metric-business-impact": {
      // Avoid cloning the same outcome in both "improving X" and "enabling better X".
      if (outcomes) {
        return normalizeBulletSentence(
          `${input.actionClause}, ${metricGerund} and improving ${outcomes}`,
        );
      }
      const impact =
        businessObject || input.plan.achievementTheme || "delivery outcomes";
      return normalizeBulletSentence(
        `${input.actionClause}, ${metricGerund}, enabling ${impact}`,
      );
    }
    case "action-metric-outcome":
    default:
      return normalizeBulletSentence(
        outcomes
          ? `${input.actionClause}, ${metricGerund} and improving ${outcomes}`
          : `${input.actionClause}, ${metricGerund} and ${businessGerund}`,
      );
  }
}

function compressToMaximumWords(text: string, maximumWords: number): string {
  const cleaned = stripFirstPersonPronouns(text.replace(/[.!?]+$/g, "").trim());
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= maximumWords) {
    return normalizeBulletSentence(cleaned);
  }
  return normalizeBulletSentence(tokens.slice(0, maximumWords).join(" "));
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
  }): { finalBullet: string; sentencePattern: BulletSentencePattern } {
    const minimumWords = input.minimumWords ?? 16;
    const preferredPattern = patternForPlan(input.plan, input.patternOffset ?? 0);
    const candidatePatterns: BulletSentencePattern[] = [
      preferredPattern,
      ...GENERAL_PATTERNS,
      "action-metric-business-impact",
    ];
    const uniquePatterns = [...new Set(candidatePatterns)];

    const candidates = uniquePatterns.flatMap((pattern) => {
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
        { finalBullet: withImpact, sentencePattern: pattern },
        { finalBullet: withoutImpact, sentencePattern: pattern },
      ];
    });

    const inRange = candidates.filter((candidate) => {
      const count = wordCount(candidate.finalBullet);
      return count >= minimumWords && count <= input.maximumWords;
    });
    if (inRange.length > 0) {
      return (
        inRange.find((candidate) => candidate.sentencePattern === preferredPattern) ??
        inRange[0]!
      );
    }

    const underMaximum = candidates
      .filter((candidate) => wordCount(candidate.finalBullet) <= input.maximumWords)
      .sort(
        (left, right) =>
          wordCount(right.finalBullet) - wordCount(left.finalBullet),
      );
    if (underMaximum[0] && wordCount(underMaximum[0].finalBullet) >= minimumWords) {
      return underMaximum[0];
    }

    // Prefer the shortest complete candidate, then compress into the scan-friendly
    // word limit rather than shipping an overlong bullet that fails validation.
    const shortest = [...candidates].sort(
      (left, right) =>
        wordCount(left.finalBullet) - wordCount(right.finalBullet),
    )[0];
    if (shortest) {
      const compressed = compressToMaximumWords(
        shortest.finalBullet,
        input.maximumWords,
      );
      if (wordCount(compressed) >= minimumWords) {
        return {
          finalBullet: compressed,
          sentencePattern: shortest.sentencePattern,
        };
      }
    }

    const base =
      candidates.find((candidate) => candidate.sentencePattern === preferredPattern)
        ?.finalBullet ?? candidates[0]?.finalBullet ?? "";
    const expanded = compressToMaximumWords(
      `${base.replace(/[.!?]+$/g, "")}, enabling stronger delivery outcomes for product and engineering stakeholders`,
      input.maximumWords,
    );
    return {
      finalBullet: expanded,
      sentencePattern: preferredPattern,
    };
  }
}
