import type {
  GenerationContext,
  SummaryExperienceYears,
  SummaryKeyword,
  SummaryTargetRole,
} from "@resume/contracts";

export interface TargetRoleAnalysisOutput {
  context: GenerationContext;
  targetRole: SummaryTargetRole;
}

export interface ExperienceYearAnalysisOutput {
  context: GenerationContext;
  experienceYears: SummaryExperienceYears;
}

export interface SummaryKeywordAllocationOutput {
  context: GenerationContext;
  keywords: SummaryKeyword[];
}

export interface SummaryCompositionOutput {
  context: GenerationContext;
  summary: string;
  keywordsUsed: SummaryKeyword[];
}
