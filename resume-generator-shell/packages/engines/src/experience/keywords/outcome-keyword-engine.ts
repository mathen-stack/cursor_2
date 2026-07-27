import type { BulletPlanItem } from "../types/bullet-plan";
import type { OutcomeKeywordDetail } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import {
  CATEGORY_OUTCOME_HINTS,
  OUTCOMES_BY_DIMENSION,
} from "./keyword-taxonomy";
import { canonicalKeywordKey } from "./keyword-normalizer";

interface OutcomeCandidate extends OutcomeKeywordDetail {
  score: number;
}

function dedupe(candidates: OutcomeCandidate[]): OutcomeCandidate[] {
  const best = new Map<string, OutcomeCandidate>();
  for (const candidate of candidates) {
    if (!candidate.canonicalKey) {
      continue;
    }
    const existing = best.get(candidate.canonicalKey);
    if (!existing || candidate.score > existing.score) {
      best.set(candidate.canonicalKey, candidate);
    }
  }
  return [...best.values()].sort(
    (left, right) => right.score - left.score || left.keyword.localeCompare(right.keyword),
  );
}

export class OutcomeKeywordEngine {
  select(input: {
    plan: BulletPlanItem;
    requirement: JDRequirement;
    usedCanonicalKeys: ReadonlySet<string>;
    maximumKeywords?: number;
  }): OutcomeKeywordDetail[] {
    const maximumKeywords = input.maximumKeywords ?? 1;
    const effectiveDimension = input.plan.leadershipFocused
      ? "technical-leadership"
      : input.plan.communicationFocused
        ? "cross-functional-alignment"
        : input.plan.achievementDimension;
    const dimensionCandidates = OUTCOMES_BY_DIMENSION[
      effectiveDimension
    ].map<OutcomeCandidate>((keyword, index) => ({
      keyword,
      canonicalKey: canonicalKeywordKey(keyword),
      rationale: `Matches the planned ${effectiveDimension} result dimension.`,
      score: 60 - index,
    }));
    const categoryScore =
      input.plan.achievementDimension === "implementation-integration" &&
      input.requirement.category !== "technical-responsibility"
        ? 72
        : 45;
    const categoryCandidates = CATEGORY_OUTCOME_HINTS[
      input.requirement.category
    ].map<OutcomeCandidate>((keyword, index) => ({
      keyword,
      canonicalKey: canonicalKeywordKey(keyword),
      rationale: `Matches the ${input.requirement.category} JD requirement outcome.`,
      score: categoryScore - index,
    }));

    const candidates = dedupe([
      ...dimensionCandidates,
      ...categoryCandidates,
    ]).filter(
      (candidate) => !input.usedCanonicalKeys.has(candidate.canonicalKey),
    );

    const selected = candidates.slice(0, maximumKeywords);
    if (selected.length < maximumKeywords) {
      throw new Error(
        `Outcome keyword inventory is insufficient for ${input.plan.bulletId}.`,
      );
    }

    return selected.map(({ score: _score, ...detail }) => detail);
  }
}
