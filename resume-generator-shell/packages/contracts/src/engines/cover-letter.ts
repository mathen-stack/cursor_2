import { z } from "zod";
import type { UserProfile } from "../common/profile";
import type { EngineInputBase, EngineOutputBase, ResumeEngine } from "./base";
import type { SummaryExperienceYears, SummaryKeyword, SummaryTargetRole } from "./summary";

export const CoverLetterGenerateSubmissionSchema = z.object({
  jobDescriptionText: z.string().min(50),
  /** Optional uploaded resume id for extra highlights. */
  baseResumeId: z.string().min(1).optional(),
  locale: z.string().min(2).default("en-US"),
});

export type CoverLetterGenerateSubmission = z.infer<
  typeof CoverLetterGenerateSubmissionSchema
>;

export interface CoverLetterEngineInput extends EngineInputBase {
  profile: UserProfile;
  /** Optional highlight bullets from an uploaded/tailored resume. */
  highlightBullets?: string[];
  /** Optional company override (otherwise inferred from JD). */
  companyName?: string;
}

export interface CoverLetterEngineOutput extends EngineOutputBase {
  coverLetter: string;
  targetRole: SummaryTargetRole;
  experienceYears: SummaryExperienceYears;
  companyName: string | null;
  keywords: SummaryKeyword[];
  wordCount: number;
  validation: {
    overallStatus: "approved" | "rejected";
    wordCountApproved: boolean;
    targetRolePresent: boolean;
    issues: Array<{ issueCode: string; severity: "warning" | "error"; message: string }>;
  };
}

export interface CoverLetterEngine
  extends ResumeEngine<CoverLetterEngineInput, CoverLetterEngineOutput> {}
