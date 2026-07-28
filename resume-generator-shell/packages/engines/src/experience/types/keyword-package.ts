import type { GenerationContext, JobDescription } from "@resume/contracts";
import type { AchievementDimension, BulletPlanItem } from "./bullet-plan";
import type { ContextualResult } from "./context";
import type { JDRequirement } from "./requirement";
import type { RoleAssignment } from "./role-assignment";

export type KeywordOrigin =
  | "direct-jd"
  | "explicit-jd-tool"
  | "strongly-inferred";

export interface DirectKeywordEvidence {
  keyword: string;
  requirementId: string;
  sourceText: string;
  startIndex: number;
  endIndex: number;
}

export interface SupportingKeywordDetail {
  keyword: string;
  canonicalKey: string;
  origin: "explicit-jd-tool" | "strongly-inferred";
  rationale: string;
  controlledReuse?: boolean;
}

export interface OutcomeKeywordDetail {
  keyword: string;
  canonicalKey: string;
  rationale: string;
}

export interface KeywordPackage {
  bulletId: string;
  experienceId: string;
  requirementId: string;
  achievementDimension: AchievementDimension;
  actionVerb: string;
  actionVerbCanonicalKey: string;
  directKeywords: string[];
  directKeywordEvidence: DirectKeywordEvidence[];
  supportingKeywords: string[];
  supportingKeywordDetails: SupportingKeywordDetail[];
  outcomeKeywords: string[];
  outcomeKeywordDetails: OutcomeKeywordDetail[];
  allocationRationale: string;
}

export interface KeywordLockRecord {
  experienceId: string;
  bulletId: string;
  kind: "action-verb" | "direct-keyword" | "supporting-keyword" | "outcome-keyword";
  value: string;
  canonicalKey: string;
  controlledReuse: boolean;
}

export interface KeywordAllocationValidation {
  allPlansAllocated: boolean;
  packageCountMatchesPlanCount: boolean;
  allBulletIdsUnique: boolean;
  allRequirementReferencesValid: boolean;
  allDirectKeywordsGroundedInJD: boolean;
  actionVerbsUniqueWithinRoles: boolean;
  supportingKeywordsDistinctWithinRoles: boolean;
  outcomeKeywordsDistinctWithinRoles: boolean;
  keywordConceptsDistinctAcrossKindsWithinRoles: boolean;
  communicationPackagesRelevant: boolean;
  leadershipPackagesRelevant: boolean;
  duplicateBulletIds: string[];
  missingPlanBulletIds: string[];
  unknownRequirementIds: string[];
  ungroundedDirectKeywords: string[];
  repeatedActionVerbKeys: string[];
  repeatedSupportingKeywordKeys: string[];
  repeatedOutcomeKeywordKeys: string[];
  repeatedCrossKindKeywordKeys: string[];
  communicationPackageErrors: string[];
  leadershipPackageErrors: string[];
  controlledDirectKeywordReuse: string[];
  warnings: string[];
  errors: string[];
  overallStatus: "approved" | "rejected";
}

export interface KeywordAllocatorInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  plans: BulletPlanItem[];
  reservedPackages?: KeywordPackage[];
  previousPackages?: KeywordPackage[];
  regenerationAttempt?: number;
}

export interface KeywordAllocatorOutput extends ContextualResult {
  packages: KeywordPackage[];
  locks?: KeywordLockRecord[];
  validation?: KeywordAllocationValidation;
}

export interface KeywordAllocator {
  readonly name: string;
  execute(input: KeywordAllocatorInput): Promise<KeywordAllocatorOutput>;
}
