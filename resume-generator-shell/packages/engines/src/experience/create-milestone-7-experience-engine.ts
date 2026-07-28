import { RealBulletComposer, type RealBulletComposerOptions } from "./composition/real-bullet-composer";
import { DefaultExperienceEngine } from "./experience-engine";
import { RealKeywordAllocator, type RealKeywordAllocatorOptions } from "./keywords/real-keyword-allocator";
import { mockExperienceValidator } from "./mocks/mock-sub-engines";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";
import { RealStarGenerator, type RealStarGeneratorOptions } from "./star/real-star-generator";

export interface Milestone7ExperienceEngineOptions {
  role?: RealRoleAssignmentEngineOptions;
  keywords?: RealKeywordAllocatorOptions;
  star?: RealStarGeneratorOptions;
  composition?: RealBulletComposerOptions;
}

/**
 * Milestone 7 composition root.
 *
 * All Experience generation stages through final compressed-STAR sentence
 * composition are real. Full Experience-section repetition, seniority, and
 * selective-regeneration validation remain the next milestone.
 */
export function createMilestone7ExperienceEngine(
  options: Milestone7ExperienceEngineOptions = {},
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
      experienceValidator: mockExperienceValidator,
    },
    { engineVersion: "0.7.0" },
  );
}
