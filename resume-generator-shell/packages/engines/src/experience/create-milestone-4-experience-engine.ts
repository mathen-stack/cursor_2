import { DefaultExperienceEngine } from "./experience-engine";
import {
  mockBulletComposer,
  mockExperienceValidator,
  mockKeywordAllocator,
  mockStarGenerator,
} from "./mocks/mock-sub-engines";
import { RealBulletPlanner } from "./planning/real-bullet-planner";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";

/**
 * Milestone 4 composition root.
 *
 * Requirement extraction, automatic role assignment, requirement-to-role
 * allocation, bullet-count planning, and achievement-theme planning are real.
 * Keyword allocation, STAR generation, bullet composition, and final
 * Experience validation remain deterministic mocks until later milestones.
 */
export function createMilestone4ExperienceEngine(
  roleOptions: RealRoleAssignmentEngineOptions = {},
): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }),
    roleAssignmentEngine: new RealRoleAssignmentEngine(roleOptions),
    bulletPlanner: new RealBulletPlanner(),
    keywordAllocator: mockKeywordAllocator,
    starGenerator: mockStarGenerator,
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  });
}
