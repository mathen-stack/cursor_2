import type {
  CareerEntry,
  ExperienceEngineOutput,
  GenerationContext,
  JobDescription,
} from "@resume/contracts";
import type { BulletPlanItem } from "./bullet-plan";
import type { ExperienceBullet } from "./composed-bullet";
import type { ContextualResult } from "./context";
import type { KeywordPackage } from "./keyword-package";
import type { JDRequirement } from "./requirement";
import type { RoleAssignment } from "./role-assignment";
import type { StarStory } from "./star-story";

export type ExperienceValidationIssueCode =
  | "minimum-bullets"
  | "missing-bullet"
  | "duplicate-bullet-id"
  | "weak-bullet"
  | "missing-metric"
  | "weak-language"
  | "ats-language"
  | "jd-traceability"
  | "domain-coherence"
  | "role-seniority"
  | "communication-coverage"
  | "leadership-coverage"
  | "exact-repetition"
  | "morphological-repetition"
  | "semantic-repetition"
  | "structural-repetition"
  | "achievement-repetition"
  | "metric-repetition"
  | "intra-bullet-repetition";

export interface ExperienceValidationIssue {
  issueCode: ExperienceValidationIssueCode;
  severity: "warning" | "error";
  message: string;
  experienceId?: string;
  bulletIds: string[];
}

export interface BulletStrengthDimensions {
  jdAlignment: number;
  technicalSpecificity: number;
  ownership: number;
  quantifiedImpact: number;
  businessValue: number;
  distinctiveness: number;
  atsLanguage: number;
  roleConsistency: number;
  domainCoherence: number;
  communicationValue: number;
  overall: number;
}

export interface ExperienceBulletDiagnostic {
  bulletId: string;
  experienceId: string;
  requirementId: string;
  approved: boolean;
  scores: BulletStrengthDimensions;
  regenerationReasons: ExperienceValidationIssueCode[];
  warnings: string[];
  errors: string[];
}

export interface SelectiveRegenerationSummary {
  attempted: boolean;
  attempts: number;
  regeneratedBulletIds: string[];
  preservedBulletIds: string[];
  exhaustedBulletIds: string[];
}

export interface ExperienceSectionValidation {
  minimumBulletsSatisfied: boolean;
  communicationCoverage: boolean;
  leadershipCoverage: boolean;
  allBulletsStrong: boolean;
  allBulletsTraceable: boolean;
  allRolesSeniorityConsistent: boolean;
  allBulletsDomainCoherent: boolean;
  atsLanguageApproved: boolean;
  duplicateAchievements: string[];
  failedBulletIds: string[];
  approvedBulletIds: string[];
  exactRepetitionGroups: string[][];
  morphologicalRepetitionGroups: string[][];
  semanticRepetitionGroups: string[][];
  structuralRepetitionGroups: string[][];
  metricRepetitionGroups: string[][];
  diagnostics: ExperienceBulletDiagnostic[];
  issues: ExperienceValidationIssue[];
  regeneration?: SelectiveRegenerationSummary;
  overallStatus: "approved" | "rejected";
}

export interface ExperienceValidationInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  careerHistory: CareerEntry[];
  assignments: RoleAssignment[];
  requirements: JDRequirement[];
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  bullets: ExperienceBullet[];
  minimumBulletsPerRole: number;
}

export interface ExperienceValidationOutput extends ContextualResult {
  experiences: ExperienceEngineOutput["experiences"];
  validation: ExperienceSectionValidation;
}

export interface ExperienceValidator {
  readonly name: string;
  execute(input: ExperienceValidationInput): Promise<ExperienceValidationOutput>;
}
