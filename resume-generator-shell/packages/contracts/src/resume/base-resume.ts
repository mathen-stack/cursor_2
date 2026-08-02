import { z } from "zod";
import {
  EducationEntrySchema,
  PersonalInformationSchema,
} from "../common/profile";

export const BaseResumeExperienceSchema = z.object({
  experienceId: z.string().min(1),
  companyName: z.string().min(1),
  role: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  bullets: z.array(z.string()).default([]),
  /** Tech / domain stack detected for this role. */
  stacks: z.array(z.string()).default([]),
});

export const BaseResumeExtractedSchema = z.object({
  personalInformation: PersonalInformationSchema.partial().extend({
    fullName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
  }),
  /** Original professional summary text, when present on the uploaded resume. */
  summary: z.string().default(""),
  experiences: z.array(BaseResumeExperienceSchema).default([]),
  education: z.array(EducationEntrySchema.partial().extend({
    educationId: z.string().min(1),
    institution: z.string().optional(),
    degree: z.string().optional(),
    field: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })).default([]),
  skills: z.array(z.string()).default([]),
  /** Aggregated stacks across roles for fast JD matching. */
  stacks: z.array(z.string()).default([]),
});

export const BaseResumeRecordSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  rawText: z.string().min(1),
  extracted: BaseResumeExtractedSchema,
  isFavorite: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const BaseResumeSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  isFavorite: z.boolean(),
  roleCount: z.number().int().nonnegative(),
  stacks: z.array(z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const BaseResumeMatchResultSchema = z.object({
  baseResumeId: z.string().min(1),
  title: z.string().min(1),
  score: z.number(),
  matchedStacks: z.array(z.string()),
  matchedRoles: z.array(z.string()),
  reasons: z.array(z.string()),
});

export type BaseResumeExperience = z.infer<typeof BaseResumeExperienceSchema>;
export type BaseResumeExtracted = z.infer<typeof BaseResumeExtractedSchema>;
export type BaseResumeRecord = z.infer<typeof BaseResumeRecordSchema>;
export type BaseResumeSummary = z.infer<typeof BaseResumeSummarySchema>;
export type BaseResumeMatchResult = z.infer<typeof BaseResumeMatchResultSchema>;
