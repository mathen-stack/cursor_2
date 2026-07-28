import type { JobDescription } from "@resume/contracts";
import type { BulletCountPlan } from "../types/bullet-plan";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import { isExperienceEligible } from "./planning-utils";

export interface RoleBulletCountPlannerInput {
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  minimumBulletsPerRole: number;
}

export class RoleBulletCountPlanner {
  plan(input: RoleBulletCountPlannerInput): BulletCountPlan[] {
    if (input.minimumBulletsPerRole < 5) {
      throw new Error("The bullet-count planner requires a minimum of five bullets per role.");
    }

    if (input.assignments.length === 0) {
      throw new Error("The bullet-count planner requires at least one role assignment.");
    }

    const eligibleRequirementCount = input.requirements.filter(
      isExperienceEligible,
    ).length;
    const orderedAssignments = [...input.assignments].sort(
      (left, right) => left.chronologyRank - right.chronologyRank,
    );

    return orderedAssignments.map((assignment) => {
      let targetBulletCount = input.minimumBulletsPerRole;
      const rationale: string[] = [
        `Enforces the project minimum of ${input.minimumBulletsPerRole} bullets.`,
      ];

      if (assignment.isMostRecent) {
        targetBulletCount = Math.min(7, input.minimumBulletsPerRole + 1);
        rationale.push(
          "Adds one bullet to the most recent role for stronger target-JD coverage.",
        );
      } else if (
        assignment.chronologyRank === 2 &&
        assignment.durationMonths >= 36 &&
        eligibleRequirementCount >= input.minimumBulletsPerRole * 2
      ) {
        targetBulletCount = Math.min(6, input.minimumBulletsPerRole + 1);
        rationale.push(
          "Adds one bullet to a substantial second-most-recent role because the JD provides enough distinct experience themes.",
        );
      }

      if (eligibleRequirementCount < targetBulletCount) {
        rationale.push(
          "The JD contains fewer atomic experience requirements than the target count, so later planning may reuse grounding requirements only with distinct achievement dimensions.",
        );
      }

      return {
        experienceId: assignment.experienceId,
        chronologyRank: assignment.chronologyRank,
        targetBulletCount,
        minimumBulletCount: input.minimumBulletsPerRole,
        rationale: rationale.join(" "),
      };
    });
  }
}
