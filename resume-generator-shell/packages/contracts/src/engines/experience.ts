import { z } from "zod";
import type { CareerEntry } from "../common/profile";
import type { EngineInputBase, EngineOutputBase, ResumeEngine } from "./base";

export const ExperienceBulletSchema = z.object({
  bulletId: z.string().min(1),
  requirementId: z.string().min(1),
  situation: z.string().min(1),
  task: z.string().min(1),
  action: z.string().min(1),
  result: z.string().min(1),
  actionVerb: z.string().min(1),
  directKeywords: z.array(z.string()),
  supportingKeywords: z.array(z.string()),
  outcomeKeywords: z.array(z.string()),
  finalBullet: z.string().min(1),
  strengthScore: z.number().min(0).max(10),
  distinctivenessScore: z.number().min(0).max(10),
  status: z.enum(["approved", "rejected"]),
});

export const GeneratedExperienceSchema = z.object({
  experienceId: z.string().min(1),
  companyName: z.string().min(1),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  assignedRole: z.string().min(1),
  bullets: z.array(ExperienceBulletSchema).min(5),
});


export interface ExperienceValidationIssueContract {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
  experienceId?: string;
  bulletIds: string[];
}

export interface ExperienceBulletDiagnosticContract {
  bulletId: string;
  experienceId: string;
  requirementId: string;
  approved: boolean;
  scores: {
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
  };
  regenerationReasons: string[];
  warnings: string[];
  errors: string[];
}

export interface SelectiveRegenerationSummaryContract {
  attempted: boolean;
  attempts: number;
  regeneratedBulletIds: string[];
  preservedBulletIds: string[];
  exhaustedBulletIds: string[];
}

export interface ExperienceEngineInput extends EngineInputBase {
  careerHistory: CareerEntry[];
}

export interface ExperienceEngineOutput extends EngineOutputBase {
  experiences: z.infer<typeof GeneratedExperienceSchema>[];
  validation: {
    minimumBulletsSatisfied: boolean;
    communicationCoverage: boolean;
    leadershipCoverage?: boolean;
    allBulletsStrong?: boolean;
    allBulletsTraceable?: boolean;
    allRolesSeniorityConsistent?: boolean;
    allBulletsDomainCoherent?: boolean;
    atsLanguageApproved?: boolean;
    duplicateAchievements: string[];
    failedBulletIds?: string[];
    approvedBulletIds?: string[];
    exactRepetitionGroups?: string[][];
    morphologicalRepetitionGroups?: string[][];
    semanticRepetitionGroups?: string[][];
    structuralRepetitionGroups?: string[][];
    metricRepetitionGroups?: string[][];
    diagnostics?: ExperienceBulletDiagnosticContract[];
    issues?: ExperienceValidationIssueContract[];
    regeneration?: SelectiveRegenerationSummaryContract;
    overallStatus: "approved" | "rejected";
  };
}

export interface ExperienceEngine
  extends ResumeEngine<ExperienceEngineInput, ExperienceEngineOutput> {}
