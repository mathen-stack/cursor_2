import { DefaultExperienceEngine } from "./experience-engine";
import {
  mockBulletComposer,
  mockExperienceValidator,
  mockStarGenerator,
} from "./mocks/mock-sub-engines";
import { RealKeywordAllocator, type RealKeywordAllocatorOptions } from "./keywords/real-keyword-allocator";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";

export interface Milestone5ExperienceEngineOptions {
  role?: RealRoleAssignmentEngineOptions;
  keywords?: RealKeywordAllocatorOptions;
}

/**
 * Milestone 5 composition root.
 *
 * Requirement extraction, role assignment, achievement planning, and global
 * keyword/action-verb allocation are real. STAR generation, sentence
 * composition, and final Experience validation remain deterministic mocks.
 */
export function createMilestone5ExperienceEngine(
  options: Milestone5ExperienceEngineOptions = {},
): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }),
    roleAssignmentEngine: new RealRoleAssignmentEngine(options.role),
    bulletPlanner: new RealBulletPlanner(),
    keywordAllocator: new RealKeywordAllocator(options.keywords),
    starGenerator: mockStarGenerator,
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  });
}
