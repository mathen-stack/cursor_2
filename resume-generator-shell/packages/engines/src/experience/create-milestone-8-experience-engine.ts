import { RealBulletComposer, type RealBulletComposerOptions } from "./composition/real-bullet-composer";
import { DefaultExperienceEngine } from "./experience-engine";
import { RealKeywordAllocator, type RealKeywordAllocatorOptions } from "./keywords/real-keyword-allocator";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealSelectiveRegenerationController, type RealSelectiveRegenerationControllerOptions } from "./regeneration/selective-regeneration-controller";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";
import { RealStarGenerator, type RealStarGeneratorOptions } from "./star/real-star-generator";
import { RealExperienceValidator, type RealExperienceValidatorOptions } from "./validation/real-experience-validator";

export interface Milestone8ExperienceEngineOptions {
  role?: RealRoleAssignmentEngineOptions;
  keywords?: RealKeywordAllocatorOptions;
  star?: RealStarGeneratorOptions;
  composition?: RealBulletComposerOptions;
  validation?: RealExperienceValidatorOptions;
  regeneration?: RealSelectiveRegenerationControllerOptions;
}

/**
 * Milestone 8 composition root.
 *
 * The complete Experience Engine is now real through section-level strength,
 * semantic repetition, ATS, seniority, domain-coherence validation, and
 * selective regeneration of only failed bullets.
 */
export function createMilestone8ExperienceEngine(
  options: Milestone8ExperienceEngineOptions = {},
): DefaultExperienceEngine {
  return new DefaultExperienceEngine(
    {
      requirementExtractor: new RealRequirementExtractor({
        model: new RuleBasedRequirementModel(),
      }),
      roleAssignmentEngine: new RealRoleAssignmentEngine(options.role),
      bulletPlanner: new RealBulletPlanner(),
      keywordAllocator: new RealKeywordAllocator(options.keywords),
      starGenerator: new RealStarGenerator(options.star),
      bulletComposer: new RealBulletComposer(options.composition),
      experienceValidator: new RealExperienceValidator(options.validation),
      selectiveRegenerationController: new RealSelectiveRegenerationController(
        options.regeneration,
      ),
    },
    { engineVersion: "0.8.0" },
  );
}
