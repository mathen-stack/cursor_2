import type { BulletPlanner, BulletPlannerInput, BulletPlannerOutput } from "../types/bullet-plan";
import { AchievementThemePlanner } from "./achievement-theme-planner";
import { RoleBulletCountPlanner } from "./bullet-count-planner";
import { validateBulletPlans } from "./bullet-plan-validator";
import { RequirementRoleAllocator } from "./requirement-role-allocator";

export interface RealBulletPlannerOptions {
  bulletCountPlanner?: RoleBulletCountPlanner;
  requirementRoleAllocator?: RequirementRoleAllocator;
  achievementThemePlanner?: AchievementThemePlanner;
}

export class RealBulletPlanner implements BulletPlanner {
  readonly name = "real-requirement-role-and-achievement-planner";

  private readonly bulletCountPlanner: RoleBulletCountPlanner;
  private readonly requirementRoleAllocator: RequirementRoleAllocator;
  private readonly achievementThemePlanner: AchievementThemePlanner;

  constructor(options: RealBulletPlannerOptions = {}) {
    this.bulletCountPlanner =
      options.bulletCountPlanner ?? new RoleBulletCountPlanner();
    this.requirementRoleAllocator =
      options.requirementRoleAllocator ?? new RequirementRoleAllocator();
    this.achievementThemePlanner =
      options.achievementThemePlanner ?? new AchievementThemePlanner();
  }

  async execute(input: BulletPlannerInput): Promise<BulletPlannerOutput> {
    this.assertInput(input);

    const bulletCounts = this.bulletCountPlanner.plan({
      jobDescription: input.jobDescription,
      assignments: input.assignments,
      requirements: input.requirements,
      minimumBulletsPerRole: input.minimumBulletsPerRole,
    });

    const requirementAllocations = this.requirementRoleAllocator.allocate({
      jobDescription: input.jobDescription,
      assignments: input.assignments,
      requirements: input.requirements,
      bulletCounts,
    });

    const countByExperience = new Map(
      bulletCounts.map((count) => [count.experienceId, count]),
    );
    const plans = [...input.assignments]
      .sort((left, right) => left.chronologyRank - right.chronologyRank)
      .flatMap((assignment) => {
        const count = countByExperience.get(assignment.experienceId);
        if (!count) {
          throw new Error(
            `Missing bullet-count plan for ${assignment.experienceId}.`,
          );
        }

        return this.achievementThemePlanner.plan({
          jobDescription: input.jobDescription,
          assignment,
          targetBulletCount: count.targetBulletCount,
          requirements: input.requirements,
          allocations: requirementAllocations,
        });
      });

    const validation = validateBulletPlans({
      assignments: input.assignments,
      requirements: input.requirements,
      minimumBulletsPerRole: input.minimumBulletsPerRole,
      bulletCounts,
      allocations: requirementAllocations,
      plans,
    });

    if (validation.overallStatus !== "approved") {
      throw new Error(
        `Bullet planning failed validation: ${validation.errors.join(" ")}`,
      );
    }

    return {
      context: input.context,
      plans,
      bulletCounts,
      requirementAllocations,
      validation,
    };
  }

  private assertInput(input: BulletPlannerInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error(
        "Bullet Planner input context does not match the supplied JD.",
      );
    }

    if (input.jobDescription.rawText.trim().length === 0) {
      throw new Error("Bullet Planner cannot process an empty JD.");
    }

    if (input.assignments.length === 0) {
      throw new Error("Bullet Planner requires at least one role assignment.");
    }

    if (input.requirements.length === 0) {
      throw new Error("Bullet Planner requires at least one JD requirement.");
    }

    if (input.minimumBulletsPerRole < 5) {
      throw new Error("Bullet Planner requires a minimum of five bullets per role.");
    }

    const experienceIds = input.assignments.map(
      (assignment) => assignment.experienceId,
    );
    const duplicateExperienceIds = experienceIds.filter(
      (experienceId, index) => experienceIds.indexOf(experienceId) !== index,
    );
    if (duplicateExperienceIds.length > 0) {
      throw new Error(
        `Bullet Planner received duplicate experience IDs: ${[
          ...new Set(duplicateExperienceIds),
        ].join(", ")}.`,
      );
    }

    const requirementIds = input.requirements.map(
      (requirement) => requirement.requirementId,
    );
    const duplicateRequirementIds = requirementIds.filter(
      (requirementId, index) => requirementIds.indexOf(requirementId) !== index,
    );
    if (duplicateRequirementIds.length > 0) {
      throw new Error(
        `Bullet Planner received duplicate requirement IDs: ${[
          ...new Set(duplicateRequirementIds),
        ].join(", ")}.`,
      );
    }
  }
}
