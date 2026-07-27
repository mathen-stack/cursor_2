import type { CareerEntry, GenerationContext, JobDescription } from "@resume/contracts";
import type { BulletComposer, ExperienceValidator, KeywordAllocator, StarGenerator } from "../sub-engines/interfaces";
import type { BulletPlanItem } from "./bullet-plan";
import type { ExperienceBullet } from "./composed-bullet";
import type { KeywordPackage } from "./keyword-package";
import type { JDRequirement } from "./requirement";
import type { RoleAssignment } from "./role-assignment";
import type { StarStory } from "./star-story";
import type { ExperienceValidationOutput } from "./validation";

export interface SelectiveRegenerationDependencies {
  keywordAllocator: KeywordAllocator;
  starGenerator: StarGenerator;
  bulletComposer: BulletComposer;
  experienceValidator: ExperienceValidator;
}

export interface SelectiveRegenerationInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  careerHistory: CareerEntry[];
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  bullets: ExperienceBullet[];
  validationOutput: ExperienceValidationOutput;
  minimumBulletsPerRole: number;
}

export interface SelectiveRegenerationOutput {
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  bullets: ExperienceBullet[];
  validationOutput: ExperienceValidationOutput;
}

export interface SelectiveRegenerationController {
  readonly name: string;
  execute(
    input: SelectiveRegenerationInput,
    dependencies: SelectiveRegenerationDependencies,
  ): Promise<SelectiveRegenerationOutput>;
}
