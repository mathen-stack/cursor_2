import type { GeneratedSkill } from "@resume/contracts";
import { SKILL_CATEGORY_ORDER } from "../skill-taxonomy";
import type {
  SkillCandidate,
  SkillRankingInput,
  SkillRankingOutput,
} from "../types/skill-candidate";

export interface SkillRankingOptions {
  maximumCategories?: number;
  maximumSkillsPerCategory?: number;
}

const PRIORITY_WEIGHT = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
} as const;

function candidateWeight(candidate: SkillCandidate): number {
  return (
    PRIORITY_WEIGHT[candidate.priority] +
    candidate.score +
    (candidate.source === "explicit" ? 100 : 0) +
    Math.min(20, candidate.mentionCount * 4)
  );
}

export class SkillRankingEngine {
  readonly name = "skill-ranking-engine";
  private readonly maximumCategories: number;
  private readonly maximumSkillsPerCategory: number;

  constructor(options: SkillRankingOptions = {}) {
    this.maximumCategories = options.maximumCategories ?? 8;
    this.maximumSkillsPerCategory = options.maximumSkillsPerCategory ?? 8;
  }

  async execute(input: SkillRankingInput): Promise<SkillRankingOutput> {
    const bestByKey = new Map<string, SkillCandidate>();
    for (const candidate of input.candidates) {
      const current = bestByKey.get(candidate.key);
      if (!current || candidateWeight(candidate) > candidateWeight(current)) {
        bestByKey.set(candidate.key, {
          ...candidate,
          evidence: candidate.evidence.map((evidence) => ({ ...evidence })),
          inferredFrom: [...candidate.inferredFrom],
        });
      }
    }

    const categoryScores = new Map<string, number>();
    for (const candidate of bestByKey.values()) {
      categoryScores.set(
        candidate.category,
        (categoryScores.get(candidate.category) ?? 0) + candidateWeight(candidate),
      );
    }

    const allowedCategories = new Set(
      [...categoryScores.entries()]
        .sort((left, right) => {
          const scoreDifference = right[1] - left[1];
          if (scoreDifference !== 0) return scoreDifference;
          return (
            SKILL_CATEGORY_ORDER.indexOf(left[0] as (typeof SKILL_CATEGORY_ORDER)[number]) -
            SKILL_CATEGORY_ORDER.indexOf(right[0] as (typeof SKILL_CATEGORY_ORDER)[number])
          );
        })
        .slice(0, this.maximumCategories)
        .map(([category]) => category),
    );

    const categoryCounts = new Map<string, number>();
    const selectedCandidates: SkillCandidate[] = [];
    const omitted: string[] = [];

    const ordered = [...bestByKey.values()].sort((left, right) => {
      const weightDifference = candidateWeight(right) - candidateWeight(left);
      if (weightDifference !== 0) return weightDifference;
      const categoryDifference =
        SKILL_CATEGORY_ORDER.indexOf(left.category) -
        SKILL_CATEGORY_ORDER.indexOf(right.category);
      return categoryDifference !== 0
        ? categoryDifference
        : left.name.localeCompare(right.name);
    });

    for (const candidate of ordered) {
      const count = categoryCounts.get(candidate.category) ?? 0;
      if (
        selectedCandidates.length >= input.maximumSkills ||
        !allowedCategories.has(candidate.category) ||
        count >= this.maximumSkillsPerCategory
      ) {
        omitted.push(candidate.name);
        continue;
      }
      selectedCandidates.push(candidate);
      categoryCounts.set(candidate.category, count + 1);
    }

    selectedCandidates.sort((left, right) => {
      const categoryDifference =
        SKILL_CATEGORY_ORDER.indexOf(left.category) -
        SKILL_CATEGORY_ORDER.indexOf(right.category);
      if (categoryDifference !== 0) return categoryDifference;
      return candidateWeight(right) - candidateWeight(left) || left.name.localeCompare(right.name);
    });

    const selected: GeneratedSkill[] = selectedCandidates.map((candidate, index) => ({
      skillId: `SKILL-${String(index + 1).padStart(3, "0")}`,
      name: candidate.name,
      normalizedKey: candidate.key,
      category: candidate.category,
      source: candidate.source,
      priority: candidate.priority,
      score: Math.max(0, Math.min(100, candidate.score)),
      evidence: candidate.evidence.map((evidence) => ({ ...evidence })),
      inferredFrom: [...candidate.inferredFrom],
    }));

    return {
      context: input.context,
      selected,
      omittedLowPrioritySkills: [...new Set(omitted)],
    };
  }
}
