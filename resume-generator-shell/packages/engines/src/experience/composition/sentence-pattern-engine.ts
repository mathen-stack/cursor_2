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
  hasCompositionCommunicationSignal,
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

/** Trailing formula fingerprint used to stop cloned metric endings. */
export function endingSkeleton(bulletText: string): string {
  const lower = bulletText
    .toLocaleLowerCase()
    .replace(/[.!?]+$/g, "");
  // Same percentage in the same "delivering a X% reduction/increase" stem is a
  // visible clone even when the measure nouns differ.
  const delivering = lower.match(
    /\bdelivering\s+(?:a\s+)?(\d+(?:\.\d+)?\s?%)\s+(reduction|increase)\b/,
  );
  if (delivering) {
    return `delivering:${delivering[1]}:${delivering[2]}`;
  }
  const byMetric = lower.match(
    /\b(?:increasing|reducing|maintaining|improving|accelerating|shortening)\s+.+?\s+by\s+(\d+(?:\.\d+)?(?:%|x))\b/,
  );
  if (byMetric) {
    // Also fingerprint the trailing enabling/while clause so identical endings
    // cannot hide behind different metric numbers.
    const trailing = lower.match(
      /,\s*((?:enabling|while|that improved|and strengthening|while reinforcing|while advancing|while strengthening|while supporting)\s+.+)$/,
    );
    if (trailing?.[1]) {
      return `by-metric:${byMetric[1]}:tail:${trailing[1]
        .replace(/\b\d+(?:\.\d+)?\s?(?:%|x)\b/gi, "<metric>")
        .replace(/\s+/g, " ")
        .trim()}`;
    }
    return `by-metric:${byMetric[1]}`;
  }
  const enabling = lower.match(
    /,\s*((?:enabling|while|that improved|and strengthening|while reinforcing|while advancing|while strengthening|while supporting)\s+.+)$/,
  );
  if (enabling?.[1]) {
    return `tail:${enabling[1].replace(/\s+/g, " ").trim()}`;
  }
  const tail = lower.split(/,\s+/).slice(-1)[0] ?? lower;
  return tail
    .replace(/\b\d+(?:\.\d+)?\s?(?:%|x)\b/gi, "<metric>")
    .replace(/\b(?:a|an|the|in|by|and|while|to|for|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diversifyEnding(
  bulletText: string,
  bulletId: string,
  usedEndingSkeletons: ReadonlySet<string> | undefined,
): string {
  const skeleton = endingSkeleton(bulletText);
  if (!usedEndingSkeletons?.has(skeleton)) {
    return bulletText;
  }
  const fallbackEndings = [
    "improving delivery predictability across product partners",
    "strengthening cross-team execution for engineering stakeholders",
    "advancing stakeholder alignment on release priorities",
    "supporting clearer handoffs across platform teams",
    "reducing coordination overhead for product delivery",
    "raising confidence in shared delivery commitments",
  ] as const;
  const seed = Math.abs(
    [...bulletId].reduce((hash, char) => hash + char.charCodeAt(0), 0),
  );
  const base = bulletText.replace(/[.!?]+$/g, "").replace(/,\s*(?:enabling|while|that improved|and strengthening|while reinforcing|while advancing|while strengthening|while supporting)\s+.+$/i, "");
  for (let offset = 0; offset < fallbackEndings.length; offset += 1) {
    const ending = fallbackEndings[(seed + offset) % fallbackEndings.length]!;
    const candidate = normalizeBulletSentence(`${base}, enabling ${ending}`);
    if (!usedEndingSkeletons.has(endingSkeleton(candidate))) {
      return candidate;
    }
  }
  return normalizeBulletSentence(
    `${base}, enabling ${fallbackEndings[seed % fallbackEndings.length]} across delivery teams`,
  );
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
    const communicationAnchor = input.plan.communicationFocused
      ? [
          "product and engineering stakeholders",
          "cross-functional collaboration",
          "stakeholder communication",
          "requirements alignment",
        ].find((phrase) => containsPhrase(input.actionClause, phrase)) ??
        "product and engineering stakeholders"
      : undefined;
    const preserve = [
      ...requiredPhrases(input.keywordPackage),
      ...(communicationAnchor ? [communicationAnchor] : []),
    ];
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
        actionClause: input.plan.communicationFocused
          ? hasCompositionCommunicationSignal(actionClause)
            ? actionClause
            : `${actionClause} with product and engineering stakeholders`
          : actionClause,
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

    // Prefer length-valid candidates, then rewrite any ending that still clones
    // a previously used trailing impact clause.
    const lengthValid = candidates.filter((candidate) => {
      const count = wordCount(candidate.finalBullet);
      return (
        count >= minimumWords &&
        count <= input.maximumWords &&
        preserve.every((phrase) => !phrase || containsPhrase(candidate.finalBullet, phrase))
      );
    });
    if (lengthValid.length > 0) {
      const selected =
        lengthValid.find((candidate) => candidate.sentencePattern === preferredPattern) ??
        lengthValid[0]!;
      return {
        ...selected,
        finalBullet: diversifyEnding(
          selected.finalBullet,
          input.plan.bulletId,
          input.usedEndingSkeletons,
        ),
      };
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
          finalBullet: diversifyEnding(
            compressed,
            input.plan.bulletId,
            input.usedEndingSkeletons,
          ),
          sentencePattern: shortest.sentencePattern,
          connectors: shortest.connectors,
        };
      }
    }

    const base =
      candidates.find((candidate) => candidate.sentencePattern === preferredPattern)
        ?.finalBullet ?? candidates[0]?.finalBullet ?? "";
    const fallbackEndings = [
      "improving delivery predictability across product partners",
      "strengthening cross-team execution for engineering stakeholders",
      "advancing stakeholder alignment on release priorities",
      "supporting clearer handoffs across platform teams",
    ] as const;
    const endingSeed = Math.abs(
      [...input.plan.bulletId].reduce((hash, char) => hash + char.charCodeAt(0), 0),
    );
    let ending =
      fallbackEndings[endingSeed % fallbackEndings.length] ??
      fallbackEndings[0]!;
    for (let offset = 0; offset < fallbackEndings.length; offset += 1) {
      const candidate =
        fallbackEndings[(endingSeed + offset) % fallbackEndings.length]!;
      const skeleton = endingSkeleton(
        `${base.replace(/[.!?]+$/g, "")}, enabling ${candidate}`,
      );
      if (!input.usedEndingSkeletons?.has(skeleton)) {
        ending = candidate;
        break;
      }
    }
    return {
      finalBullet: compressToMaximumWords(
        `${base.replace(/[.!?]+$/g, "")}, enabling ${ending}`,
        input.maximumWords,
        preserve,
      ),
      sentencePattern: preferredPattern,
      connectors: [],
    };
  }
}
