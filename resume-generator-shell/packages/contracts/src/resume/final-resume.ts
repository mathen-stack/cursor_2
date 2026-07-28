import { z } from "zod";
import {
  JobDescriptionSchema,
  type JobDescription,
} from "../common/job-description";
import {
  UserProfileSchema,
  type UserProfile,
} from "../common/profile";
import type { GenerationContext } from "../common/generation-context";
import type { ExperienceEngineOutput } from "../engines/experience";
import type { SkillsEngineOutput } from "../engines/skills";
import type { SummaryEngineOutput } from "../engines/summary";
import type {
  TemplateEngineOutput,
  TemplateSectionId,
} from "../engines/template";
import type { EvidenceEnhancementReport } from "../evidence/source-evidence";
import type { ResumeWordedReadinessReport } from "./readiness";

export const ResumeGenerationRequestSchema = z.object({
  jobDescription: JobDescriptionSchema,
  profile: UserProfileSchema,
  locale: z.string().min(2).default("en-US"),
  /** Optional original resume text used only for additive evidence enhancement. */
  sourceResumeText: z.string().min(40).optional(),
});

export interface ResumeGenerationRequest {
  jobDescription: JobDescription;
  profile: UserProfile;
  locale: string;
  /** Optional original resume text used only for additive evidence enhancement. */
  sourceResumeText?: string;
}

export const ResumeGenerationSubmissionSchema = z.object({
  jobDescriptionText: z.string().min(50),
  profile: UserProfileSchema,
  locale: z.string().min(2).default("en-US"),
  /** Optional original resume text used only for additive evidence enhancement. */
  sourceResumeText: z.string().min(40).optional(),
});

export type ResumeGenerationSubmission = z.infer<
  typeof ResumeGenerationSubmissionSchema
>;

export interface FinalContactSection {
  id: "contact";
  heading: string;
  content: UserProfile["personalInformation"];
}

export interface FinalSummarySection {
  id: "professional-summary";
  heading: string;
  content: string;
}

export interface FinalSkillsSection {
  id: "skills";
  heading: string;
  content: SkillsEngineOutput["categories"];
}

export interface FinalExperienceSection {
  id: "professional-experience";
  heading: string;
  content: Array<{
    experienceId: string;
    companyName: string;
    startDate: string;
    endDate: string;
    assignedRole: string;
    bullets: string[];
  }>;
}

export interface FinalEducationSection {
  id: "education";
  heading: string;
  content: UserProfile["education"];
}

export type FinalResumeSection =
  | FinalContactSection
  | FinalSummarySection
  | FinalSkillsSection
  | FinalExperienceSection
  | FinalEducationSection;

export interface FinalResumeAssemblyIssue {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
  sectionId?: TemplateSectionId;
}

export interface FinalResumeAssemblyValidation {
  contextApproved: boolean;
  allEngineOutputsApproved: boolean;
  sectionOrderApproved: boolean;
  sectionSelectionApproved: boolean;
  contactPreserved: boolean;
  educationPreserved: boolean;
  summaryPreserved: boolean;
  skillsPreserved: boolean;
  experiencePreserved: boolean;
  sourceOutputsUnmodified: boolean;
  noUnsupportedSections: boolean;
  overallStatus: "approved" | "rejected";
  issues: FinalResumeAssemblyIssue[];
}

export interface EngineExecutionTelemetry {
  engineName: string;
  engineVersion: string;
  status: "approved" | "rejected" | "failed";
  durationMs: number;
}

export interface ResumeOrchestrationTelemetry {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  engines: EngineExecutionTelemetry[];
}

export interface FinalResumeDocument {
  documentId: string;
  templateId: string;
  sectionOrder: TemplateSectionId[];
  sections: FinalResumeSection[];
  sourceFingerprints: {
    profile: string;
    summary: string;
    skills: string;
    experience: string;
    template: string;
  };
  contentFingerprint: string;
}

export interface FinalResumeData {
  context: GenerationContext;
  jobDescription: JobDescription;
  profile: UserProfile;
  summary: SummaryEngineOutput;
  skills: SkillsEngineOutput;
  experience: ExperienceEngineOutput;
  template: TemplateEngineOutput;
  document: FinalResumeDocument;
  assemblyValidation: FinalResumeAssemblyValidation;
  orchestration: ResumeOrchestrationTelemetry;
  /** Evaluation-only metadata. It never changes assembled resume content. */
  readiness?: ResumeWordedReadinessReport;
  /**
   * Additive evidence enhancement audit trail. Content changes only happen when
   * proposals pass existing validators; rejected proposals keep original text.
   */
  evidenceEnhancement?: EvidenceEnhancementReport;
}
