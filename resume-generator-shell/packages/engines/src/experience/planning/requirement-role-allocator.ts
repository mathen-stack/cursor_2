import type { JobDescription } from "@resume/contracts";
import type {
  BulletCountPlan,
  RequirementRoleAllocation,
} from "../types/bullet-plan";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import {
  isExperienceEligible,
  requirementPlanningOrder,
  requirementRoleFitScore,
} from "./planning-utils";

export interface RequirementRoleAllocatorInput {
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  bulletCounts: BulletCountPlan[];
}

interface RoleLoad {
  assignment: RoleAssignment;
  capacity: number;
  allocated: number;
}

export class RequirementRoleAllocator {
  allocate(input: RequirementRoleAllocatorInput): RequirementRoleAllocation[] {
    if (input.jobDescription.rawText.trim().length === 0) {
      throw new Error("Requirement-to-role allocation cannot run with an empty JD.");
    }

    const eligibleRequirements = input.requirements
      .filter(isExperienceEligible)
      .sort(requirementPlanningOrder);

    if (eligibleRequirements.length === 0) {
      throw new Error(
        "Requirement-to-role allocation found no experience-eligible JD requirements.",
      );
    }

    const countByExperience = new Map(
      input.bulletCounts.map((count) => [count.experienceId, count]),
    );
    const roleLoads: RoleLoad[] = [...input.assignments]
      .sort((left, right) => left.chronologyRank - right.chronologyRank)
      .map((assignment) => {
        const count = countByExperience.get(assignment.experienceId);
        if (!count) {
          throw new Error(
            `Missing bullet-count plan for ${assignment.experienceId}.`,
          );
        }
        return {
          assignment,
          capacity: count.targetBulletCount,
          allocated: 0,
        };
      });

    const allocations: RequirementRoleAllocation[] = [];

    for (const requirement of eligibleRequirements) {
      const rankedRoles = roleLoads
        .map((roleLoad) => {
          const fitScore = requirementRoleFitScore(
            requirement,
            roleLoad.assignment,
          );
          const capacityPenalty =
            roleLoad.capacity === 0
              ? 1000
              : Math.round((roleLoad.allocated / roleLoad.capacity) * 28);
          const overCapacityPenalty =
            roleLoad.allocated >= roleLoad.capacity ? 40 : 0;

          return {
            roleLoad,
            score: fitScore - capacityPenalty - overCapacityPenalty,
          };
        })
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }
          return (
            left.roleLoad.assignment.chronologyRank -
            right.roleLoad.assignment.chronologyRank
          );
        });

      const selected = rankedRoles[0];
      if (!selected) {
        throw new Error(
          `No role is available for requirement ${requirement.requirementId}.`,
        );
      }

      selected.roleLoad.allocated += 1;
      allocations.push({
        requirementId: requirement.requirementId,
        experienceId: selected.roleLoad.assignment.experienceId,
        allocationKind: "primary",
        score: selected.score,
        priority: requirement.priority,
        category: requirement.category,
        rationale: this.buildRationale(
          requirement,
          selected.roleLoad.assignment,
          selected.score,
        ),
      });
    }

    this.ensureEveryRoleHasGrounding(
      allocations,
      roleLoads,
      eligibleRequirements,
    );

    return allocations.sort((left, right) => {
      const leftRole = roleLoads.find(
        (item) => item.assignment.experienceId === left.experienceId,
      );
      const rightRole = roleLoads.find(
        (item) => item.assignment.experienceId === right.experienceId,
      );
      const roleOrder =
        (leftRole?.assignment.chronologyRank ?? Number.MAX_SAFE_INTEGER) -
        (rightRole?.assignment.chronologyRank ?? Number.MAX_SAFE_INTEGER);
      if (roleOrder !== 0) {
        return roleOrder;
      }
      return left.requirementId.localeCompare(right.requirementId);
    });
  }

  private ensureEveryRoleHasGrounding(
    allocations: RequirementRoleAllocation[],
    roleLoads: RoleLoad[],
    eligibleRequirements: JDRequirement[],
  ): void {
    const coveredExperiences = new Set(
      allocations.map((allocation) => allocation.experienceId),
    );

    for (const roleLoad of roleLoads) {
      if (coveredExperiences.has(roleLoad.assignment.experienceId)) {
        continue;
      }

      const bestRequirement = [...eligibleRequirements].sort((left, right) => {
        const scoreDifference =
          requirementRoleFitScore(right, roleLoad.assignment) -
          requirementRoleFitScore(left, roleLoad.assignment);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        return requirementPlanningOrder(left, right);
      })[0];

      if (!bestRequirement) {
        throw new Error(
          `Unable to ground role ${roleLoad.assignment.experienceId} in the JD.`,
        );
      }

      allocations.push({
        requirementId: bestRequirement.requirementId,
        experienceId: roleLoad.assignment.experienceId,
        allocationKind: "primary",
        score: requirementRoleFitScore(bestRequirement, roleLoad.assignment),
        priority: bestRequirement.priority,
        category: bestRequirement.category,
        rationale:
          "Reused as primary role grounding because this career entry otherwise had no allocated experience requirement.",
      });
    }
  }

  private buildRationale(
    requirement: JDRequirement,
    assignment: RoleAssignment,
    score: number,
  ): string {
    const reasons: string[] = [
      `Assigned ${requirement.requirementId} to ${assignment.assignedRole} with fit score ${score}.`,
    ];

    if (assignment.sourceRequirementIds.includes(requirement.requirementId)) {
      reasons.push("The automatic role assignment already identified this requirement as a focus signal.");
    }

    if (assignment.isMostRecent && requirement.priority !== "low") {
      reasons.push("Recent-role placement strengthens coverage of an important target-JD requirement.");
    }

    if (
      requirement.category === "leadership" ||
      requirement.category === "architecture"
    ) {
      reasons.push("The requirement is placed where role seniority can support ownership and scope.");
    }

    return reasons.join(" ");
  }
}
