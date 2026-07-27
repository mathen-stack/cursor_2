import { z } from "zod";
import type { UserProfile } from "../common/profile";
import type { EngineInputBase, EngineOutputBase, ResumeEngine } from "./base";

export const SkillSourceSchema = z.enum(["explicit", "inferred"]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillPrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);
export type SkillPriority = z.infer<typeof SkillPrioritySchema>;

export const SkillEvidenceSchema = z.object({
  sourceText: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().positive(),
});
export type SkillEvidence = z.infer<typeof SkillEvidenceSchema>;

export const GeneratedSkillSchema = z.object({
  skillId: z.string().min(1),
  name: z.string().min(1),
  normalizedKey: z.string().min(1),
  category: z.string().min(1),
  source: SkillSourceSchema,
  priority: SkillPrioritySchema,
  score: z.number().min(0).max(100),
  evidence: z.array(SkillEvidenceSchema),
  inferredFrom: z.array(z.string()).default([]),
});
export type GeneratedSkill = z.infer<typeof GeneratedSkillSchema>;

export interface SkillCategory {
  name: string;
  skills: string[];
}

export interface SkillsValidationIssue {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
  skillIds: string[];
}

export interface SkillsEngineInput extends EngineInputBase {
  profile: UserProfile;
}

export interface SkillsEngineOutput extends EngineOutputBase {
  categories: SkillCategory[];
  skills: GeneratedSkill[];
  validation: {
    explicitSkillsCovered: boolean;
    noDuplicateSkills: boolean;
    categoryStructureApproved: boolean;
    inferredSkillsGrounded: boolean;
    skillDensityApproved: boolean;
    totalSkillCount: number;
    explicitSkillCount: number;
    inferredSkillCount: number;
    omittedLowPrioritySkills: string[];
    issues: SkillsValidationIssue[];
    overallStatus: "approved" | "rejected";
  };
}

export interface SkillsEngine
  extends ResumeEngine<SkillsEngineInput, SkillsEngineOutput> {}
