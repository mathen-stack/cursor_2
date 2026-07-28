import { DefaultExperienceEngine } from "./experience-engine";
import {
  mockBulletComposer,
  mockBulletPlanner,
  mockExperienceValidator,
  mockKeywordAllocator,
  mockRequirementExtractor,
  mockRoleAssignmentEngine,
  mockStarGenerator,
} from "./mocks/mock-sub-engines";

export function createMockExperienceEngine(): DefaultExperienceEngine {
  return new DefaultExperienceEngine({
    requirementExtractor: mockRequirementExtractor,
    roleAssignmentEngine: mockRoleAssignmentEngine,
    bulletPlanner: mockBulletPlanner,
    keywordAllocator: mockKeywordAllocator,
    starGenerator: mockStarGenerator,
    bulletComposer: mockBulletComposer,
    experienceValidator: mockExperienceValidator,
  });
}
