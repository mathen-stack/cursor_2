import type {
  ExperienceEngine,
  ExperienceEngineInput,
  ExperienceEngineOutput,
} from "@resume/contracts";
import type {
  BulletComposer,
  BulletPlanner,
  ExperienceValidator,
  KeywordAllocator,
  RequirementExtractor,
  RoleAssignmentEngine,
  StarGenerator,
} from "./sub-engines/interfaces";
import type { SelectiveRegenerationController } from "./types/regeneration";
import { assertSubEngineContextMatch } from "./types/context";

export interface ExperienceEngineDependencies {
  requirementExtractor: RequirementExtractor;
  roleAssignmentEngine: RoleAssignmentEngine;
  bulletPlanner: BulletPlanner;
  keywordAllocator: KeywordAllocator;
  starGenerator: StarGenerator;
  bulletComposer: BulletComposer;
  experienceValidator: ExperienceValidator;
  selectiveRegenerationController?: SelectiveRegenerationController;
}

export interface ExperienceEngineOptions {
  minimumBulletsPerRole?: number;
  engineVersion?: string;
}

export class DefaultExperienceEngine implements ExperienceEngine {
  readonly name = "experience-engine";
  readonly version: string;

  private readonly minimumBulletsPerRole: number;

  constructor(
    private readonly dependencies: ExperienceEngineDependencies,
    options: ExperienceEngineOptions = {},
  ) {
    this.minimumBulletsPerRole = options.minimumBulletsPerRole ?? 5;
    this.version = options.engineVersion ?? "0.6.0";

    if (this.minimumBulletsPerRole < 5) {
      throw new Error("minimumBulletsPerRole must be at least 5.");
    }
  }

  async execute(input: ExperienceEngineInput): Promise<ExperienceEngineOutput> {
    this.assertInputContext(input);

    const requirements = await this.dependencies.requirementExtractor.execute({
      context: input.context,
      jobDescription: input.jobDescription,
    });
    assertSubEngineContextMatch(
      input.context,
      requirements.context,
      this.dependencies.requirementExtractor.name,
    );

    const roles = await this.dependencies.roleAssignmentEngine.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      careerHistory: input.careerHistory,
      requirements: requirements.requirements,
    });
    assertSubEngineContextMatch(
      input.context,
      roles.context,
      this.dependencies.roleAssignmentEngine.name,
    );

    const plans = await this.dependencies.bulletPlanner.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      assignments: roles.assignments,
      requirements: requirements.requirements,
      minimumBulletsPerRole: this.minimumBulletsPerRole,
    });
    assertSubEngineContextMatch(
      input.context,
      plans.context,
      this.dependencies.bulletPlanner.name,
    );

    const keywords = await this.dependencies.keywordAllocator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      assignments: roles.assignments,
      requirements: requirements.requirements,
      plans: plans.plans,
    });
    assertSubEngineContextMatch(
      input.context,
      keywords.context,
      this.dependencies.keywordAllocator.name,
    );

    const stories = await this.dependencies.starGenerator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      assignments: roles.assignments,
      requirements: requirements.requirements,
      plans: plans.plans,
      keywordPackages: keywords.packages,
    });
    assertSubEngineContextMatch(
      input.context,
      stories.context,
      this.dependencies.starGenerator.name,
    );

    const composed = await this.dependencies.bulletComposer.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      plans: plans.plans,
      keywordPackages: keywords.packages,
      stories: stories.stories,
    });
    assertSubEngineContextMatch(
      input.context,
      composed.context,
      this.dependencies.bulletComposer.name,
    );

    let validated = await this.dependencies.experienceValidator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      careerHistory: input.careerHistory,
      assignments: roles.assignments,
      requirements: requirements.requirements,
      plans: plans.plans,
      keywordPackages: keywords.packages,
      stories: stories.stories,
      bullets: composed.bullets,
      minimumBulletsPerRole: this.minimumBulletsPerRole,
    });
    assertSubEngineContextMatch(
      input.context,
      validated.context,
      this.dependencies.experienceValidator.name,
    );

    if (
      validated.validation.overallStatus === "rejected" &&
      this.dependencies.selectiveRegenerationController
    ) {
      const regenerated = await this.dependencies.selectiveRegenerationController.execute(
        {
          context: input.context,
          jobDescription: input.jobDescription,
          careerHistory: input.careerHistory,
          assignments: roles.assignments,
          requirements: requirements.requirements,
          plans: plans.plans,
          keywordPackages: keywords.packages,
          stories: stories.stories,
          bullets: composed.bullets,
          validationOutput: validated,
          minimumBulletsPerRole: this.minimumBulletsPerRole,
        },
        {
          keywordAllocator: this.dependencies.keywordAllocator,
          starGenerator: this.dependencies.starGenerator,
          bulletComposer: this.dependencies.bulletComposer,
          experienceValidator: this.dependencies.experienceValidator,
        },
      );
      validated = regenerated.validationOutput;
    }

    // Safety net: residual warning-only validation (e.g. ownership/leadership
    // scope) must not reject the engine after composition + regeneration.
    const hardIssues = (validated.validation.issues ?? []).some(
      (issue) => issue.severity === "error",
    );
    const approved =
      validated.validation.overallStatus === "approved" ||
      ((validated.validation.failedBulletIds?.length ?? 0) === 0 && !hardIssues);
    const validation = approved
      ? { ...validated.validation, overallStatus: "approved" as const }
      : validated.validation;

    return {
      context: input.context,
      engineName: this.name,
      engineVersion: this.version,
      status: approved ? "approved" : "rejected",
      experiences: validated.experiences,
      validation,
    };
  }

  private assertInputContext(input: ExperienceEngineInput): void {
    const matches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash;

    if (!matches) {
      throw new Error(
        "Experience Engine input context does not match the supplied JD.",
      );
    }
  }
}
