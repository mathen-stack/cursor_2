import { z } from "zod";
import type { GenerationContext } from "../common/generation-context";
import type { FinalResumeData } from "./final-resume";

export const ResumeReadinessCategoryIdSchema = z.enum([
  "impact",
  "quantified-achievements",
  "action-verbs",
  "brevity",
  "jd-relevance",
  "skills-coverage",
  "leadership-and-growth",
  "communication-and-collaboration",
  "repetition-control",
  "ats-and-formatting",
  "section-completeness",
]);
export type ResumeReadinessCategoryId = z.infer<
  typeof ResumeReadinessCategoryIdSchema
>;

export const ResumeReadinessOwnerSchema = z.enum([
  "profile",
  "summary",
  "skills",
  "experience",
  "template",
  "rendering",
  "orchestrator",
]);
export type ResumeReadinessOwner = z.infer<typeof ResumeReadinessOwnerSchema>;

export interface ResumeReadinessCategoryScore {
  categoryId: ResumeReadinessCategoryId;
  label: string;
  weight: number;
  score: number;
  weightedPoints: number;
  status: "strong" | "acceptable" | "weak" | "critical";
  evidence: string[];
}

export interface ResumeReadinessIssue {
  issueCode: string;
  severity: "warning" | "error";
  categoryId: ResumeReadinessCategoryId;
  owner: ResumeReadinessOwner;
  message: string;
  suggestedAction: string;
  affectedIds: string[];
  blocksExternalTest: boolean;
}

export interface ResumeReadinessCriticalGates {
  assemblyApproved: boolean;
  allSourceEnginesApproved: boolean;
  allExperienceBulletsApproved: boolean;
  quantifiedBulletCoverageApproved: boolean;
  directJdCoverageApproved: boolean;
  atsStructureApproved: boolean;
  noCriticalRepetition: boolean;
  summaryLengthApproved: boolean;
  contentFingerprintApproved: boolean;
  overallApproved: boolean;
}

export interface ResumeReadinessMetrics {
  totalBullets: number;
  approvedBullets: number;
  quantifiedBullets: number;
  quantifiedBulletRatio: number;
  averageBulletWords: number;
  bulletsWithinPreferredLength: number;
  preferredLengthRatio: number;
  uniqueActionVerbRatio: number;
  averageExperienceStrength: number;
  averageExperienceDistinctiveness: number;
  directSummaryKeywordCount: number;
  explicitSkillCount: number;
  inferredSkillCount: number;
  skillCount: number;
  jdCoverageScore: number;
  communicationBulletCount: number;
  leadershipSignalCount: number;
  duplicateGroupCount: number;
  requiredSectionCount: number;
  presentRequiredSectionCount: number;
}

export interface ResumeWordedReadinessReport {
  reportId: string;
  engineName: "resume-worded-readiness-engine";
  engineVersion: string;
  context: GenerationContext;
  documentFingerprint: string;
  internalScore: number;
  targetInternalScore: 95;
  estimatedExternalBand:
    | "90-plus-likely"
    | "85-to-89-likely"
    | "below-85-likely";
  readyForExternalTest: boolean;
  contentMutated: false;
  categories: ResumeReadinessCategoryScore[];
  criticalGates: ResumeReadinessCriticalGates;
  metrics: ResumeReadinessMetrics;
  issues: ResumeReadinessIssue[];
  overallStatus: "approved" | "rejected";
  createdAt: string;
  disclaimer: string;
}

export interface ResumeReadinessSubmission {
  resume: FinalResumeData;
}

export const ExternalResumeTestPlatformSchema = z.enum(["resume-worded"]);
export type ExternalResumeTestPlatform = z.infer<
  typeof ExternalResumeTestPlatformSchema
>;

export const ExternalResumeFeedbackCategorySchema = z.enum([
  "impact",
  "brevity",
  "style",
  "sections",
  "ats",
  "keyword-relevance",
  "leadership",
  "growth",
  "repetition",
  "formatting",
  "other",
]);
export type ExternalResumeFeedbackCategory = z.infer<
  typeof ExternalResumeFeedbackCategorySchema
>;

export const ExternalResumeFeedbackItemSchema = z.object({
  category: ExternalResumeFeedbackCategorySchema,
  message: z.string().min(1).max(2000),
});
export type ExternalResumeFeedbackItem = z.infer<
  typeof ExternalResumeFeedbackItemSchema
>;

export const ExternalResumeTestInputSchema = z.object({
  platform: ExternalResumeTestPlatformSchema.default("resume-worded"),
  generationId: z.string().min(1),
  jdId: z.string().min(1),
  jdHash: z.string().min(1),
  documentFingerprint: z.string().min(1),
  internalReadinessScore: z.number().min(0).max(100),
  overallScore: z.number().min(0).max(100),
  relevancyScore: z.number().min(0).max(100).optional(),
  feedback: z.array(ExternalResumeFeedbackItemSchema).default([]),
  notes: z.string().max(4000).optional(),
  testedAt: z.string().datetime().optional(),
});
export type ExternalResumeTestInput = z.infer<
  typeof ExternalResumeTestInputSchema
>;

export interface CalibrationIssueMapping {
  feedbackCategory: ExternalResumeFeedbackCategory;
  owner: ResumeReadinessOwner;
  readinessCategoryId: ResumeReadinessCategoryId;
  confidence: number;
  feedbackMessage: string;
  recommendedEngineAction: string;
}

export interface ExternalResumeTestRecord {
  calibrationId: string;
  platform: ExternalResumeTestPlatform;
  generationId: string;
  jdId: string;
  jdHash: string;
  documentFingerprint: string;
  internalReadinessScore: number;
  externalOverallScore: number;
  externalRelevancyScore?: number;
  overallScoreDelta: number;
  relevancyScoreDelta?: number;
  feedback: ExternalResumeFeedbackItem[];
  mappedIssues: CalibrationIssueMapping[];
  notes?: string;
  testedAt: string;
  recordedAt: string;
  isolationPolicy: "generation-scoped";
}

export interface ExternalResumeTestListResult {
  records: ExternalResumeTestRecord[];
  total: number;
}
