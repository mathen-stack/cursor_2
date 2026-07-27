import type {
  BulletCountPlan,
  BulletPlanItem,
  BulletPlanningValidation,
  RequirementRoleAllocation,
} from "../types/bullet-plan";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  isExperienceAchievementRequirement,
  isExperienceEligible,
} from "./planning-utils";

export interface BulletPlanValidatorInput {
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  minimumBulletsPerRole: number;
  bulletCounts: BulletCountPlan[];
  allocations: RequirementRoleAllocation[];
  plans: BulletPlanItem[];
}

export function validateBulletPlans(
  input: BulletPlanValidatorInput,
): BulletPlanningValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requirementIds = new Set(
    input.requirements.map((requirement) => requirement.requirementId),
  );
  const allExperienceRequirements = input.requirements.filter(isExperienceEligible);
  const achievementRequirements = allExperienceRequirements.filter(
    isExperienceAchievementRequirement,
  );
  const eligibleRequirements =
    achievementRequirements.length > 0
      ? achievementRequirements
      : allExperienceRequirements;
  const countByExperience = new Map(
    input.bulletCounts.map((count) => [count.experienceId, count]),
  );
  const plansByExperience = new Map<string, BulletPlanItem[]>();

  for (const plan of input.plans) {
    const current = plansByExperience.get(plan.experienceId) ?? [];
    plansByExperience.set(plan.experienceId, [...current, plan]);
  }

  const experiencesBelowMinimum: string[] = [];
  const targetCountFailures: string[] = [];
  const experiencesWithoutCommunication: string[] = [];
  const repeatedThemeKeys: string[] = [];

  for (const assignment of input.assignments) {
    const rolePlans = plansByExperience.get(assignment.experienceId) ?? [];
    const countPlan = countByExperience.get(assignment.experienceId);

    if (rolePlans.length < input.minimumBulletsPerRole) {
      experiencesBelowMinimum.push(assignment.experienceId);
    }

    if (!countPlan || rolePlans.length !== countPlan.targetBulletCount) {
      targetCountFailures.push(assignment.experienceId);
    }

    if (!rolePlans.some((plan) => plan.communicationFocused)) {
      experiencesWithoutCommunication.push(assignment.experienceId);
    }

    const seenDimensions = new Set<string>();
    for (const plan of rolePlans) {
      const themeKey = `${assignment.experienceId}:${plan.achievementDimension}`;
      if (seenDimensions.has(plan.achievementDimension)) {
        repeatedThemeKeys.push(themeKey);
      }
      seenDimensions.add(plan.achievementDimension);
    }
  }

  const allBulletIds = input.plans.map((plan) => plan.bulletId);
  const duplicateBulletIds = [...new Set(
    allBulletIds.filter(
      (bulletId, index) => allBulletIds.indexOf(bulletId) !== index,
    ),
  )];

  const invalidRequirementReferences = input.plans.flatMap((plan) => [
    ...(requirementIds.has(plan.requirementId)
      ? []
      : [`${plan.bulletId}:${plan.requirementId}`]),
    ...plan.supportingRequirementIds
      .filter((requirementId) => !requirementIds.has(requirementId))
      .map((requirementId) => `${plan.bulletId}:${requirementId}`),
  ]);

  const invalidAllocationReferences = input.allocations
    .filter(
      (allocation) =>
        !requirementIds.has(allocation.requirementId) ||
        !input.assignments.some(
          (assignment) => assignment.experienceId === allocation.experienceId,
        ),
    )
    .map(
      (allocation) =>
        `${allocation.experienceId}:${allocation.requirementId}`,
    );

  const coveredRequirementIds = new Set(
    input.plans.flatMap((plan) => [
      plan.requirementId,
      ...plan.supportingRequirementIds,
    ]),
  );
  const uncoveredCriticalRequirementIds = eligibleRequirements
    .filter(
      (requirement) =>
        requirement.priority === "critical" &&
        !coveredRequirementIds.has(requirement.requirementId),
    )
    .map((requirement) => requirement.requirementId);
  const highPriorityRequirements = eligibleRequirements.filter(
    (requirement) => requirement.priority === "high",
  );
  const uncoveredHighPriorityRequirementIds = highPriorityRequirements
    .filter(
      (requirement) => !coveredRequirementIds.has(requirement.requirementId),
    )
    .map((requirement) => requirement.requirementId);
  const highPriorityRequirementCoverage =
    highPriorityRequirements.length === 0
      ? 1
      : (highPriorityRequirements.length -
          uncoveredHighPriorityRequirementIds.length) /
        highPriorityRequirements.length;

  const allExperiencesPlanned = input.assignments.every((assignment) =>
    plansByExperience.has(assignment.experienceId),
  );
  const minimumBulletsSatisfied = experiencesBelowMinimum.length === 0;
  const targetCountsSatisfied = targetCountFailures.length === 0;
  const allRequirementReferencesValid =
    invalidRequirementReferences.length === 0 &&
    invalidAllocationReferences.length === 0;
  const allBulletIdsUnique = duplicateBulletIds.length === 0;
  const communicationCoverage =
    experiencesWithoutCommunication.length === 0;
  const distinctThemesWithinRoles = repeatedThemeKeys.length === 0;
  const criticalRequirementCoverage =
    uncoveredCriticalRequirementIds.length === 0;

  if (!allExperiencesPlanned) {
    errors.push("At least one assigned experience has no bullet plan.");
  }
  if (!minimumBulletsSatisfied) {
    errors.push(
      `Experiences below the minimum bullet count: ${experiencesBelowMinimum.join(", ")}.`,
    );
  }
  if (!targetCountsSatisfied) {
    errors.push(
      `Experiences that do not match their target bullet count: ${targetCountFailures.join(", ")}.`,
    );
  }
  if (!allRequirementReferencesValid) {
    errors.push(
      `Invalid requirement references: ${[
        ...invalidRequirementReferences,
        ...invalidAllocationReferences,
      ].join(", ")}.`,
    );
  }
  if (!allBulletIdsUnique) {
    errors.push(`Duplicate bullet IDs: ${duplicateBulletIds.join(", ")}.`);
  }
  if (!communicationCoverage) {
    errors.push(
      `Experiences without a communication-focused plan: ${experiencesWithoutCommunication.join(", ")}.`,
    );
  }
  if (!distinctThemesWithinRoles) {
    errors.push(
      `Repeated achievement dimensions within roles: ${repeatedThemeKeys.join(", ")}.`,
    );
  }
  if (!criticalRequirementCoverage) {
    errors.push(
      `Uncovered critical requirements: ${uncoveredCriticalRequirementIds.join(", ")}.`,
    );
  }
  if (highPriorityRequirementCoverage < 1) {
    warnings.push(
      `Some high-priority requirements were not selected for Experience bullets: ${uncoveredHighPriorityRequirementIds.join(", ")}. They may be allocated to Summary or Skills later.`,
    );
  }
  if (
    input.plans.some(
      (plan) => plan.requirementAllocationKind === "reused-grounding",
    )
  ) {
    warnings.push(
      "At least one JD requirement was reused as grounding because a role needed more bullets than the JD supplied distinct experience requirements. Every reused plan still has a unique achievement dimension.",
    );
  }

  return {
    allExperiencesPlanned,
    minimumBulletsSatisfied,
    targetCountsSatisfied,
    allRequirementReferencesValid,
    allBulletIdsUnique,
    communicationCoverage,
    distinctThemesWithinRoles,
    criticalRequirementCoverage,
    highPriorityRequirementCoverage,
    duplicateBulletIds,
    experiencesBelowMinimum,
    experiencesWithoutCommunication,
    repeatedThemeKeys,
    uncoveredCriticalRequirementIds,
    uncoveredHighPriorityRequirementIds,
    warnings,
    errors,
    overallStatus: errors.length === 0 ? "approved" : "rejected",
  };
}
