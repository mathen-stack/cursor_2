import type {
  GenerationContext,
  JobDescription,
} from "@resume/contracts";
import type { ContextualResult } from "./context";
import type {
  JDRequirement,
  RequirementCategory,
  RequirementPriority,
} from "./requirement";
import type { RoleAssignment } from "./role-assignment";

export type AchievementDimension =
  | "architecture-design"
  | "production-delivery"
  | "performance-optimization"
  | "reliability-observability"
  | "quality-automation"
  | "scalability-capacity"
  | "cost-efficiency"
  | "security-governance"
  | "data-quality"
  | "customer-business-impact"
  | "cross-functional-alignment"
  | "technical-leadership"
  | "mentoring-knowledge-sharing"
  | "implementation-integration";

export type RequirementAllocationKind =
  | "primary"
  | "supporting"
  | "reused-grounding";

export interface BulletCountPlan {
  experienceId: string;
  chronologyRank: number;
  targetBulletCount: number;
  minimumBulletCount: number;
  rationale: string;
}

export interface RequirementRoleAllocation {
  requirementId: string;
  experienceId: string;
  allocationKind: "primary";
  score: number;
  priority: RequirementPriority;
  category: RequirementCategory;
  rationale: string;
}

export interface BulletPlanItem {
  bulletId: string;
  experienceId: string;
  sequence: number;
  requirementId: string;
  supportingRequirementIds: string[];
  /**
   * Critical (or other) requirements counted as covered for planning validation
   * only. Unlike supportingRequirementIds, these do not feed keyword allocation
   * or STAR composition.
   */
  coverageRequirementIds?: string[];
  requirementAllocationKind: RequirementAllocationKind;
  achievementDimension: AchievementDimension;
  achievementTheme: string;
  roleFocusArea: string;
  communicationFocused: boolean;
  leadershipFocused: boolean;
  planningRationale: string;
}

export interface BulletPlanningValidation {
  allExperiencesPlanned: boolean;
  minimumBulletsSatisfied: boolean;
  targetCountsSatisfied: boolean;
  allRequirementReferencesValid: boolean;
  allBulletIdsUnique: boolean;
  communicationCoverage: boolean;
  distinctThemesWithinRoles: boolean;
  criticalRequirementCoverage: boolean;
  highPriorityRequirementCoverage: number;
  duplicateBulletIds: string[];
  experiencesBelowMinimum: string[];
  experiencesWithoutCommunication: string[];
  repeatedThemeKeys: string[];
  uncoveredCriticalRequirementIds: string[];
  uncoveredHighPriorityRequirementIds: string[];
  warnings: string[];
  errors: string[];
  overallStatus: "approved" | "rejected";
}

export interface BulletPlannerInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  minimumBulletsPerRole: number;
}

export interface BulletPlannerOutput extends ContextualResult {
  plans: BulletPlanItem[];
  bulletCounts?: BulletCountPlan[];
  requirementAllocations?: RequirementRoleAllocation[];
  validation?: BulletPlanningValidation;
}

export interface BulletPlanner {
  readonly name: string;
  execute(input: BulletPlannerInput): Promise<BulletPlannerOutput>;
}
