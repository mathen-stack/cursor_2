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
          ? `${input.actionClause}, delivering ${metricNoun} and measurable gains in ${outcomes}`
          : `${input.actionClause}, delivering ${metricNoun} while ${businessGerund}`,
      );
    case "action-metric-business-impact": {
      const impact = input.includeBusinessImpact
        ? businessObject || outcomes || input.plan.achievementTheme
        : outcomes || businessObject || input.plan.achievementTheme;
      const outcomeClause = outcomes
        ? ` and improving ${outcomes}`
        : "";
      return normalizeBulletSentence(
        `${input.actionClause}, ${metricGerund}${outcomeClause}, enabling ${impact}`,
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

export class SentencePatternEngine {
  compose(input: {
    actionClause: string;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    story: StarStory;
    maximumWords: number;
    patternOffset?: number;
  }): { finalBullet: string; sentencePattern: BulletSentencePattern } {
    const preferredPattern = patternForPlan(input.plan, input.patternOffset ?? 0);
    const preferred = buildWithPattern({
      ...input,
      pattern: preferredPattern,
      includeBusinessImpact: true,
    });
    if (wordCount(preferred) <= input.maximumWords) {
      return { finalBullet: preferred, sentencePattern: preferredPattern };
    }

    const compactPattern: BulletSentencePattern = "action-metric-outcome";
    const compact = buildWithPattern({
      ...input,
      pattern: compactPattern,
      includeBusinessImpact: false,
    });
    return { finalBullet: compact, sentencePattern: compactPattern };
  }
}
