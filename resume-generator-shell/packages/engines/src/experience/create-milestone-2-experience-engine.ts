import { DefaultExperienceEngine } from "./experience-engine";
import {
  mockBulletComposer,
  mockBulletPlanner,
  mockExperienceValidator,
  mockKeywordAllocator,
  mockRoleAssignmentEngine,
  mockStarGenerator,
} from "./mocks/mock-sub-engines";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";

/**
 * Milestone 2 composition root.
 *
 * Requirement extraction is real and JD-grounded. All downstream engines stay
 * deterministic mocks until their own implementation milestones.
 */
export function createMilestone2ExperienceEngine(): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }),
    roleAssignmentEngine: mockRoleAssignmentEngine,
    bulletPlanner: mockBulletPlanner,
    keywordAllocator: mockKeywordAllocator,
    starGenerator: mockStarGenerator,
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  });
}
