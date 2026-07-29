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

function candidateWeight(
  candidate: SkillCandidate,
  experienceEvidenceKeys?: ReadonlySet<string>,
): number {
  const evidencedInExperience = experienceEvidenceKeys?.has(candidate.key)
    ? 250
    : 0;
  return (
    PRIORITY_WEIGHT[candidate.priority] +
    candidate.score +
    (candidate.source === "explicit" ? 100 : 0) +
    Math.min(20, candidate.mentionCount * 4) +
    evidencedInExperience
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNameContainedBy(
  candidateName: string,
  otherName: string,
): boolean {
  if (candidateName.length >= otherName.length) {
    return false;
  }
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9])${escapeRegExp(candidateName)}(?=[^A-Za-z0-9]|$)`,
    "i",
  );
  return pattern.test(otherName);
}

function dropContainedSkills(candidates: SkillCandidate[]): SkillCandidate[] {
  // Keep high/critical explicit JD skills even when a longer sibling name
  // contains them (e.g. bare "CSS" beside "Tailwind CSS" / "CSS Modules").
  // Dropping those here omits required skills and fails validation.
  return candidates.filter(
    (candidate) =>
      isRequiredExplicit(candidate) ||
      !candidates.some(
        (other) =>
          other.key !== candidate.key &&
          isNameContainedBy(candidate.name, other.name),
      ),
  );
}

function isRequiredExplicit(candidate: SkillCandidate): boolean {
  return (
    candidate.source === "explicit" &&
    (candidate.priority === "critical" || candidate.priority === "high")
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
    const experienceEvidenceKeys = input.experienceEvidenceKeys ?? new Set<string>();
    const bestByKey = new Map<string, SkillCandidate>();
    for (const candidate of input.candidates) {
      const current = bestByKey.get(candidate.key);
      if (
        !current ||
        candidateWeight(candidate, experienceEvidenceKeys) >
          candidateWeight(current, experienceEvidenceKeys)
      ) {
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
        (categoryScores.get(candidate.category) ?? 0) +
          candidateWeight(candidate, experienceEvidenceKeys),
      );
    }

    const requiredCategories = [
      ...new Set(
        [...bestByKey.values()]
          .filter(isRequiredExplicit)
          .map((candidate) => candidate.category),
      ),
    ].sort(
      (left, right) =>
        SKILL_CATEGORY_ORDER.indexOf(left as (typeof SKILL_CATEGORY_ORDER)[number]) -
        SKILL_CATEGORY_ORDER.indexOf(right as (typeof SKILL_CATEGORY_ORDER)[number]),
    );

    const scoredCategories = [...categoryScores.entries()]
      .sort((left, right) => {
        const scoreDifference = right[1] - left[1];
        if (scoreDifference !== 0) return scoreDifference;
        return (
          SKILL_CATEGORY_ORDER.indexOf(left[0] as (typeof SKILL_CATEGORY_ORDER)[number]) -
          SKILL_CATEGORY_ORDER.indexOf(right[0] as (typeof SKILL_CATEGORY_ORDER)[number])
        );
      })
      .map(([category]) => category);

    const allowedCategories = new Set<string>(requiredCategories);
    const categoryBudget = Math.max(
      this.maximumCategories,
      requiredCategories.length,
    );
    for (const category of scoredCategories) {
      if (allowedCategories.size >= categoryBudget) {
        break;
      }
      allowedCategories.add(category);
    }

    const categoryCounts = new Map<string, number>();
    const selectedCandidates: SkillCandidate[] = [];
    const omitted: string[] = [];
    const selectedKeys = new Set<string>();

    const ordered = [...bestByKey.values()].sort((left, right) => {
      const weightDifference =
        candidateWeight(right, experienceEvidenceKeys) -
        candidateWeight(left, experienceEvidenceKeys);
      if (weightDifference !== 0) return weightDifference;
      const categoryDifference =
        SKILL_CATEGORY_ORDER.indexOf(left.category) -
        SKILL_CATEGORY_ORDER.indexOf(right.category);
      return categoryDifference !== 0
        ? categoryDifference
        : left.name.localeCompare(right.name);
    });

    // Experience-evidenced skills are preferred among optionals so the Skills
    // section reflects technologies demonstrated in generated experience.
    const requiredExplicit = ordered.filter(isRequiredExplicit);
    const experienceEvidencedOptional = ordered.filter(
      (candidate) =>
        !isRequiredExplicit(candidate) &&
        experienceEvidenceKeys.has(candidate.key),
    );
    const optional = ordered.filter(
      (candidate) =>
        !isRequiredExplicit(candidate) &&
        !experienceEvidenceKeys.has(candidate.key),
    );

    const trySelect = (candidate: SkillCandidate, forceRequired: boolean): boolean => {
      if (selectedKeys.has(candidate.key)) {
        return false;
      }
      if (!allowedCategories.has(candidate.category)) {
        // Required high-priority explicit skills must never be dropped because
        // their category was outside the optional category budget.
        if (forceRequired) {
          allowedCategories.add(candidate.category);
        } else {
          return false;
        }
      }
      const count = categoryCounts.get(candidate.category) ?? 0;
      if (
        !forceRequired &&
        (selectedCandidates.length >= input.maximumSkills ||
          count >= this.maximumSkillsPerCategory)
      ) {
        return false;
      }
      if (forceRequired && selectedCandidates.length >= input.maximumSkills) {
        // Prefer staying near maximumSkills by dropping optionals first.
        // If every selected skill is already required, still add this one so
        // dense JDs never omit high-priority explicit skills.
        const dropIndex = [...selectedCandidates]
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => !isRequiredExplicit(item))
          .sort(
            (left, right) =>
              candidateWeight(left.item, experienceEvidenceKeys) -
              candidateWeight(right.item, experienceEvidenceKeys),
          )[0]?.index;
        if (dropIndex !== undefined) {
          const dropped = selectedCandidates.splice(dropIndex, 1)[0];
          if (dropped) {
            selectedKeys.delete(dropped.key);
            categoryCounts.set(
              dropped.category,
              Math.max(0, (categoryCounts.get(dropped.category) ?? 1) - 1),
            );
            omitted.push(dropped.name);
          }
        }
      }

      selectedCandidates.push(candidate);
      selectedKeys.add(candidate.key);
      categoryCounts.set(
        candidate.category,
        (categoryCounts.get(candidate.category) ?? 0) + 1,
      );
      return true;
    };

    for (const candidate of requiredExplicit) {
      if (!trySelect(candidate, true)) {
        omitted.push(candidate.name);
      }
    }
    for (const candidate of experienceEvidencedOptional) {
      if (!trySelect(candidate, false)) {
        omitted.push(candidate.name);
      }
    }
    for (const candidate of optional) {
      if (!trySelect(candidate, false)) {
        omitted.push(candidate.name);
      }
    }

    // Density fill: when grounded candidates remain and we are below the
    // configured floor, force-select them (still JD-triggered only).
    const minimumSkills = Math.max(0, input.minimumSkills ?? 0);
    if (selectedCandidates.length < minimumSkills) {
      for (const candidate of ordered) {
        if (selectedCandidates.length >= minimumSkills) {
          break;
        }
        if (selectedKeys.has(candidate.key)) {
          continue;
        }
        allowedCategories.add(candidate.category);
        if (!trySelect(candidate, true)) {
          omitted.push(candidate.name);
        }
      }
    }

    selectedCandidates.sort((left, right) => {
      const categoryDifference =
        SKILL_CATEGORY_ORDER.indexOf(left.category) -
        SKILL_CATEGORY_ORDER.indexOf(right.category);
      if (categoryDifference !== 0) return categoryDifference;
      const leftEvidenced = experienceEvidenceKeys.has(left.key) ? 1 : 0;
      const rightEvidenced = experienceEvidenceKeys.has(right.key) ? 1 : 0;
      if (leftEvidenced !== rightEvidenced) {
        return rightEvidenced - leftEvidenced;
      }
      return (
        candidateWeight(right, experienceEvidenceKeys) -
          candidateWeight(left, experienceEvidenceKeys) ||
        left.name.localeCompare(right.name)
      );
    });

    let dedupedCandidates = dropContainedSkills(selectedCandidates);
    for (const dropped of selectedCandidates) {
      if (!dedupedCandidates.some((item) => item.key === dropped.key)) {
        omitted.push(dropped.name);
      }
    }

    // Contained-name dedupe must not re-break the density floor when grounded
    // candidates are still available.
    if (dedupedCandidates.length < minimumSkills) {
      const keptKeys = new Set(dedupedCandidates.map((item) => item.key));
      const refillPool = [
        ...selectedCandidates.filter((item) => !keptKeys.has(item.key)),
        ...ordered.filter((item) => !keptKeys.has(item.key)),
      ].sort(
        (left, right) =>
          candidateWeight(right, experienceEvidenceKeys) -
            candidateWeight(left, experienceEvidenceKeys) ||
          left.name.localeCompare(right.name),
      );
      for (const candidate of refillPool) {
        if (dedupedCandidates.length >= minimumSkills) {
          break;
        }
        if (keptKeys.has(candidate.key)) {
          continue;
        }
        dedupedCandidates.push(candidate);
        keptKeys.add(candidate.key);
      }
    }

    // Stable category ordering after possible density refill.
    dedupedCandidates = [...dedupedCandidates].sort((left, right) => {
      const categoryDifference =
        SKILL_CATEGORY_ORDER.indexOf(left.category) -
        SKILL_CATEGORY_ORDER.indexOf(right.category);
      if (categoryDifference !== 0) return categoryDifference;
      const leftEvidenced = experienceEvidenceKeys.has(left.key) ? 1 : 0;
      const rightEvidenced = experienceEvidenceKeys.has(right.key) ? 1 : 0;
      if (leftEvidenced !== rightEvidenced) {
        return rightEvidenced - leftEvidenced;
      }
      return (
        candidateWeight(right, experienceEvidenceKeys) -
          candidateWeight(left, experienceEvidenceKeys) ||
        left.name.localeCompare(right.name)
      );
    });

    const selected: GeneratedSkill[] = dedupedCandidates.map((candidate, index) => ({
      skillId: `SKILL-${String(index + 1).padStart(3, "0")}`,
      name: candidate.name,
      normalizedKey: candidate.key,
      category: candidate.category,
      source: candidate.source,
      priority: candidate.priority,
      score: Math.max(0, Math.min(100, candidate.score)),
      evidence: candidate.evidence.map((evidence) => ({ ...evidence })),
      inferredFrom: [...candidate.inferredFrom],
      evidencedInExperience: experienceEvidenceKeys.has(candidate.key),
    }));

    return {
      context: input.context,
      selected,
      omittedLowPrioritySkills: [...new Set(omitted)],
    };
  }
}
