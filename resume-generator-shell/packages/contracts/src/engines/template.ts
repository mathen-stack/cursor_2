import { z } from "zod";
import type { UserProfile } from "../common/profile";
import type { EngineInputBase, EngineOutputBase, ResumeEngine } from "./base";

export const TemplateSectionIdSchema = z.enum([
  "contact",
  "professional-summary",
  "skills",
  "professional-experience",
  "education",
  "certifications",
  "projects",
  "publications",
  "awards",
]);
export type TemplateSectionId = z.infer<typeof TemplateSectionIdSchema>;

export const TemplatePageSizeSchema = z.enum(["letter", "a4"]);
export type TemplatePageSize = z.infer<typeof TemplatePageSizeSchema>;

export const TemplateDensitySchema = z.enum([
  "compact",
  "balanced",
  "spacious",
]);
export type TemplateDensity = z.infer<typeof TemplateDensitySchema>;

export const TemplateSenioritySchema = z.enum([
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
  "manager",
]);
export type TemplateSeniority = z.infer<typeof TemplateSenioritySchema>;

export interface TemplateSectionDefinition {
  id: TemplateSectionId;
  heading: string;
  required: boolean;
  keepTogether: boolean;
  pageBreakBefore: boolean;
  spacingBeforePt: number;
  spacingAfterPt: number;
}

export interface TemplateTypography {
  fontFamily: "Arial" | "Calibri" | "Times New Roman";
  bodySizePt: number;
  bodyLineHeight: number;
  nameSizePt: number;
  sectionHeadingSizePt: number;
  roleHeadingSizePt: number;
  contactSizePt: number;
  sectionHeadingCase: "uppercase" | "title-case";
}

export interface TemplateMargins {
  topInches: number;
  rightInches: number;
  bottomInches: number;
  leftInches: number;
}

export interface TemplateSpacing {
  sectionGapPt: number;
  entryGapPt: number;
  bulletGapPt: number;
  paragraphGapPt: number;
  bulletIndentInches: number;
  hangingIndentInches: number;
}

export interface TemplateAlignment {
  contact: "left" | "center";
  dates: "right";
  sectionHeadings: "left";
  body: "left";
}

export interface TemplateAtsSafeguards {
  singleColumn: true;
  usesTablesForCoreContent: false;
  usesTextBoxes: false;
  usesIcons: false;
  usesGraphics: false;
  coreContentInHeaderOrFooter: false;
  selectableTextRequired: true;
  standardBulletsRequired: true;
  readingOrder: "top-to-bottom";
  standardSectionHeadings: true;
}

export interface TemplateContentEstimate {
  careerEntryCount: number;
  educationEntryCount: number;
  estimatedBulletCount: number;
  estimatedSkillCount: number;
  estimatedSummaryWords: number;
  estimatedRenderedLines: number;
  estimatedLinesPerPage: number;
  pageUtilizationRatio: number;
}

export interface TemplateDefinition {
  templateId: string;
  templateName: string;
  sectionOrder: TemplateSectionId[];
  sections: TemplateSectionDefinition[];
  layout: "single-column";
  columns: 1;
  pageTarget: 1 | 2;
  pageSize: TemplatePageSize;
  density: TemplateDensity;
  typography: TemplateTypography;
  margins: TemplateMargins;
  spacing: TemplateSpacing;
  alignment: TemplateAlignment;
  atsSafeguards: TemplateAtsSafeguards;
  contentEstimate: TemplateContentEstimate;
}

export interface TemplateRoleAnalysis {
  targetRole: string;
  roleFamily: string;
  seniority: TemplateSeniority;
  confidence: number;
}

export interface TemplateValidationIssue {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
}

export interface TemplateValidationResult {
  sectionSelectionApproved: boolean;
  sectionOrderApproved: boolean;
  singleColumnApproved: boolean;
  atsSafeguardsApproved: boolean;
  typographyApproved: boolean;
  marginsApproved: boolean;
  spacingApproved: boolean;
  pageTargetApproved: boolean;
  contentFitApproved: boolean;
  deterministicDefinitionApproved: boolean;
  resumeWordedReadinessScore: number;
  issues: TemplateValidationIssue[];
  overallStatus: "approved" | "rejected";
}

export interface TemplateEngineInput extends EngineInputBase {
  profile: UserProfile;
}

export interface TemplateEngineOutput extends EngineOutputBase {
  roleAnalysis: TemplateRoleAnalysis;
  template: TemplateDefinition;
  validation: TemplateValidationResult;
}

export interface TemplateEngine
  extends ResumeEngine<TemplateEngineInput, TemplateEngineOutput> {}
