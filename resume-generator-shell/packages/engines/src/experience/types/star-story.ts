import type { GenerationContext, JobDescription } from "@resume/contracts";
import type { AchievementDimension, BulletPlanItem } from "./bullet-plan";
import type { ContextualResult } from "./context";
import type { KeywordPackage } from "./keyword-package";
import type { JDRequirement } from "./requirement";
import type { RoleAssignment } from "./role-assignment";

export type StarMetricType =
  | "percentage"
  | "availability"
  | "latency"
  | "throughput"
  | "scale"
  | "time"
  | "cost"
  | "quality"
  | "delivery"
  | "productivity";

export type StarMetricDirection = "increase" | "decrease" | "maintain";

export interface StarMetric {
  metricId: string;
  metricType: StarMetricType;
  direction: StarMetricDirection;
  value: number;
  unit: "%" | "ms" | "x" | "hours" | "days";
  displayText: string;
  measure: string;
  outcomeKeyword: string;
  rationale: string;
  provenance: "generated-hypothetical";
}

export interface StarStory {
  bulletId: string;
  experienceId: string;
  requirementId: string;
  achievementDimension: AchievementDimension;
  situation: string;
  task: string;
  action: string;
  result: string;
  technicalImpact: string;
  businessImpact: string;
  metrics: StarMetric[];
  coherenceScore: number;
  metricPlausibilityScore: number;
  status: "approved" | "rejected";
}

export interface StarGenerationValidation {
  allPlansCovered: boolean;
  storyCountMatchesPlanCount: boolean;
  allStoryIdsUnique: boolean;
  allRequirementReferencesValid: boolean;
  allActionsUseAllocatedVerbs: boolean;
  allDirectKeywordsUsed: boolean;
  allSupportingKeywordsUsed: boolean;
  allOutcomesUsed: boolean;
  allStoriesCoherent: boolean;
  allMetricsPlausible: boolean;
  metricPatternsDistinctWithinRoles: boolean;
  communicationStoriesRelevant: boolean;
  leadershipStoriesRelevant: boolean;
  duplicateStoryIds: string[];
  missingPlanBulletIds: string[];
  unknownRequirementIds: string[];
  actionVerbErrors: string[];
  missingDirectKeywordUsages: string[];
  missingSupportingKeywordUsages: string[];
  missingOutcomeKeywordUsages: string[];
  incoherentStoryIds: string[];
  implausibleMetricIds: string[];
  repeatedMetricPatterns: string[];
  communicationStoryErrors: string[];
  leadershipStoryErrors: string[];
  warnings: string[];
  errors: string[];
  overallStatus: "approved" | "rejected";
}

export interface StarGeneratorInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  reservedStories?: StarStory[];
  previousStories?: StarStory[];
  regenerationAttempt?: number;
}

export interface StarGeneratorOutput extends ContextualResult {
  stories: StarStory[];
  validation?: StarGenerationValidation;
}

export interface StarGenerator {
  readonly name: string;
  execute(input: StarGeneratorInput): Promise<StarGeneratorOutput>;
}
