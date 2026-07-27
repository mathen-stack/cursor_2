import { z } from "zod";
import type { UserProfile } from "../common/profile";
import type { EngineInputBase, EngineOutputBase, ResumeEngine } from "./base";

export const SummarySenioritySchema = z.enum([
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
  "manager",
]);
export type SummarySeniority = z.infer<typeof SummarySenioritySchema>;

export const SummaryKeywordCategorySchema = z.enum([
  "role",
  "domain",
  "technical",
  "outcome",
  "leadership",
  "collaboration",
]);
export type SummaryKeywordCategory = z.infer<
  typeof SummaryKeywordCategorySchema
>;

export const SummaryKeywordSourceSchema = z.enum(["direct", "inferred"]);
export type SummaryKeywordSource = z.infer<typeof SummaryKeywordSourceSchema>;

export const SummaryKeywordEvidenceSchema = z.object({
  sourceText: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
});
export type SummaryKeywordEvidence = z.infer<
  typeof SummaryKeywordEvidenceSchema
>;

export const SummaryKeywordSchema = z.object({
  keywordId: z.string().min(1),
  text: z.string().min(1),
  normalizedKey: z.string().min(1),
  category: SummaryKeywordCategorySchema,
  source: SummaryKeywordSourceSchema,
  priority: z.number().min(0).max(100),
  evidence: z.array(SummaryKeywordEvidenceSchema),
});
export type SummaryKeyword = z.infer<typeof SummaryKeywordSchema>;

export const SummaryYearsSourceSchema = z.enum([
  "explicit-jd",
  "career-timeline",
  "seniority-inference",
]);
export type SummaryYearsSource = z.infer<typeof SummaryYearsSourceSchema>;

export interface SummaryTargetRole {
  title: string;
  family: string;
  seniority: SummarySeniority;
  confidence: number;
  evidence: SummaryKeywordEvidence[];
}

export interface SummaryExperienceYears {
  value: number;
  display: string;
  source: SummaryYearsSource;
  jdRequiredYears: number | null;
  calculatedCareerYears: number | null;
}

export interface SummaryValidationIssue {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
}

export interface SummaryEngineInput extends EngineInputBase {
  profile: UserProfile;
}

export interface SummaryEngineOutput extends EngineOutputBase {
  summary: string;
  wordCount: number;
  targetRole: SummaryTargetRole;
  experienceYears: SummaryExperienceYears;
  keywords: SummaryKeyword[];
  validation: {
    wordCountApproved: boolean;
    targetRolePresent: boolean;
    yearsOfExperiencePresent: boolean;
    directKeywordCoverageApproved: boolean;
    seniorityAligned: boolean;
    noPersonalPronouns: boolean;
    noCliches: boolean;
    noWeakLanguage: boolean;
    noKeywordStuffing: boolean;
    sentenceStructureApproved: boolean;
    atsLanguageApproved: boolean;
    resumeWordedReadinessScore: number;
    issues: SummaryValidationIssue[];
    overallStatus: "approved" | "rejected";
  };
}

export interface SummaryEngine
  extends ResumeEngine<SummaryEngineInput, SummaryEngineOutput> {}
