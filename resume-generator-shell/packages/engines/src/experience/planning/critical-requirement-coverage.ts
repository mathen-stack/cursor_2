import type {
  BulletPlanItem,
  RequirementRoleAllocation,
} from "../types/bullet-plan";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  isExperienceAchievementRequirement,
  isExperienceEligible,
  requirementPlanningOrder,
  requirementRoleFitScore,
} from "./planning-utils";

function planningEligibleRequirements(
  requirements: JDRequirement[],
): JDRequirement[] {
  const allExperienceRequirements = requirements.filter(isExperienceEligible);
  const achievementRequirements = allExperienceRequirements.filter(
    isExperienceAchievementRequirement,
  );
  return achievementRequirements.length > 0
    ? achievementRequirements
    : allExperienceRequirements;
}

function coveredRequirementIds(plans: BulletPlanItem[]): Set<string> {
  return new Set(
    plans.flatMap((plan) => [
      plan.requirementId,
      ...plan.supportingRequirementIds,
    ]),
  );
}

/**
 * When the JD has more critical experience requirements than distinct bullet
 * slots, attach leftover criticals as supportingRequirementIds so planning
 * validation still passes without inventing extra bullets.
 */
export function ensureCriticalRequirementCoverage(input: {
  plans: BulletPlanItem[];
  requirements: JDRequirement[];
  assignments: RoleAssignment[];
  allocations: RequirementRoleAllocation[];
}): BulletPlanItem[] {
  const eligibleRequirements = planningEligibleRequirements(input.requirements);
  const covered = coveredRequirementIds(input.plans);
  const uncoveredCriticals = eligibleRequirements
    .filter(
      (requirement) =>
        requirement.priority === "critical" &&
        !covered.has(requirement.requirementId),
    )
    .sort(requirementPlanningOrder);

  if (uncoveredCriticals.length === 0) {
    return input.plans.map((plan) => ({
      ...plan,
      supportingRequirementIds: [...plan.supportingRequirementIds],
    }));
  }

  const assignmentByExperience = new Map(
    input.assignments.map((assignment) => [
      assignment.experienceId,
      assignment,
    ]),
  );
  const allocationExperienceByRequirement = new Map(
    input.allocations.map((allocation) => [
      allocation.requirementId,
      allocation.experienceId,
    ]),
  );

  const plans = input.plans.map((plan) => ({
    ...plan,
    supportingRequirementIds: [...plan.supportingRequirementIds],
  }));

  for (const requirement of uncoveredCriticals) {
    const preferredExperienceId = allocationExperienceByRequirement.get(
      requirement.requirementId,
    );
    const rankedPlans = plans
      .map((plan, index) => {
        const assignment = assignmentByExperience.get(plan.experienceId);
        if (!assignment) {
          return null;
        }
        const fitScore = requirementRoleFitScore(requirement, assignment);
        const preferredBonus =
          preferredExperienceId === plan.experienceId ? 50 : 0;
        const supportingPenalty = plan.supportingRequirementIds.length * 3;
        const alreadyPrimary =
          plan.requirementId === requirement.requirementId ? 1000 : 0;
        return {
          index,
          plan,
          score: fitScore + preferredBonus - supportingPenalty + alreadyPrimary,
        };
      })
      .filter(
        (
          item,
        ): item is {
          index: number;
          plan: BulletPlanItem;
          score: number;
        } => item !== null,
      )
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        return left.plan.bulletId.localeCompare(right.plan.bulletId);
      });

    const selected = rankedPlans[0];
    if (!selected) {
      throw new Error(
        `Unable to attach uncovered critical requirement ${requirement.requirementId} to any bullet plan.`,
      );
    }

    if (
      selected.plan.requirementId !== requirement.requirementId &&
      !selected.plan.supportingRequirementIds.includes(requirement.requirementId)
    ) {
      selected.plan.supportingRequirementIds.push(requirement.requirementId);
      selected.plan.planningRationale = [
        selected.plan.planningRationale,
        `Attached critical ${requirement.requirementId} as supporting coverage because distinct bullet capacity was already exhausted.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
  }

  return plans;
}
