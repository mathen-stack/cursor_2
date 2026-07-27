import { DefaultExperienceEngine } from "./experience-engine";
import {
  mockBulletComposer,
  mockBulletPlanner,
  mockExperienceValidator,
  mockKeywordAllocator,
  mockStarGenerator,
} from "./mocks/mock-sub-engines";
import { RealRequirementExtractor } from "./requirement-extraction/real-requirement-extractor";
import { RuleBasedRequirementModel } from "./requirement-extraction/rule-based-requirement-model";
import {
  RealRoleAssignmentEngine,
  type RealRoleAssignmentEngineOptions,
} from "./role-assignment/real-role-assignment-engine";

/**
 * Milestone 3 composition root.
 *
 * Requirement extraction and automatic role assignment are real and
 * JD-grounded. Bullet planning and all downstream generation remain
 * deterministic mocks until their individual implementation milestones.
 */
export function createMilestone3ExperienceEngine(
  roleOptions: RealRoleAssignmentEngineOptions = {},
): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: new RealRequirementExtractor({
      model: new RuleBasedRequirementModel(),
    }),
    roleAssignmentEngine: new RealRoleAssignmentEngine(roleOptions),
    bulletPlanner: mockBulletPlanner,
    keywordAllocator: mockKeywordAllocator,
    starGenerator: mockStarGenerator,
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  });
}
