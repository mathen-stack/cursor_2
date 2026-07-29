import { DefaultExperienceEngine } from "./experience-engine";
import { RealKeywordAllocator, type RealKeywordAllocatorOptions } from "./keywords/real-keyword-allocator";
import {
  mockBulletComposer,
  mockExperienceValidator,
} from "./mocks/mock-sub-engines";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";
import { RealStarGenerator, type RealStarGeneratorOptions } from "./star/real-star-generator";

export interface Milestone6ExperienceEngineOptions {
  role?: RealRoleAssignmentEngineOptions;
  keywords?: RealKeywordAllocatorOptions;
  star?: RealStarGeneratorOptions;
}

/**
 * Milestone 6 composition root.
 *
 * Requirement extraction, role assignment, bullet planning, keyword allocation,
 * and Situation/Task/Action/Result/Metric generation are real. Final sentence
 * composition and full Experience-section validation remain deterministic mocks.
 */
export function createMilestone6ExperienceEngine(
  options: Milestone6ExperienceEngineOptions = {},
): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }),
    roleAssignmentEngine: new RealRoleAssignmentEngine(options.role),
    bulletPlanner: new RealBulletPlanner(),
    keywordAllocator: new RealKeywordAllocator(options.keywords),
    starGenerator: new RealStarGenerator(options.star),
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  }, { engineVersion: "0.6.0" });
}
