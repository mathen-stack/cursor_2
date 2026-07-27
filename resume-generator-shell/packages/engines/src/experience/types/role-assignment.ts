import type {
  CareerEntry,
  GenerationContext,
  JobDescription,
} from "@resume/contracts";
import type { ContextualResult } from "./context";
import type { JDRequirement } from "./requirement";

export type CareerSeniority =
  | "entry"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "staff"
  | "principal"
  | "manager";

export type RoleFamily =
  | "machine-learning"
  | "applied-ai"
  | "generative-ai"
  | "mlops"
  | "data-engineering"
  | "data-science"
  | "software-engineering"
  | "backend-engineering"
  | "frontend-engineering"
  | "full-stack-engineering"
  | "platform-engineering"
  | "cloud-engineering"
  | "devops-engineering"
  | "security-engineering"
  | "solutions-engineering"
  // Additive multi-stack families (original families above are unchanged).
  | "mobile-engineering"
  | "qa-engineering"
  | "database-engineering"
  | "embedded-engineering"
  | "blockchain-engineering";

export interface TargetRoleEvidence {
  sourceText: string;
  reason: "explicit-title" | "role-family-signal" | "seniority-signal";
}

export interface TargetRoleAnalysis {
  targetRole: string;
  baseRole: string;
  roleFamily: RoleFamily;
  seniority: CareerSeniority;
  explicitTitleFound: boolean;
  confidence: number;
  requiredYears: number | null;
  evidence: TargetRoleEvidence[];
}

export interface RoleAssignment {
  experienceId: string;
  assignedRole: string;
  seniority: CareerSeniority;
  focusAreas: string[];
  sourceRequirementIds: string[];
  chronologyRank: number;
  durationMonths: number;
  isMostRecent: boolean;
  rationale: string;
}

export interface RoleAssignmentValidation {
  allCareerEntriesAssigned: boolean;
  targetRoleAssignedToMostRecent: boolean;
  naturalProgression: boolean;
  focusAreasGroundedInRequirements: boolean;
  duplicateExperienceIds: string[];
  errors: string[];
  overallStatus: "approved" | "rejected";
}

export interface RoleAssignmentInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  careerHistory: CareerEntry[];
  requirements: JDRequirement[];
}

export interface RoleAssignmentOutput extends ContextualResult {
  targetRoleAnalysis?: TargetRoleAnalysis;
  assignments: RoleAssignment[];
  validation?: RoleAssignmentValidation;
}

export interface RoleAssignmentEngine {
  readonly name: string;
  execute(input: RoleAssignmentInput): Promise<RoleAssignmentOutput>;
}
