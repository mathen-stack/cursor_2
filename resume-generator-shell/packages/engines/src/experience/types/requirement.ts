import type { GenerationContext, JobDescription } from "@resume/contracts";
import type { ContextualResult } from "./context";

export type RequirementCategory =
  | "technical-responsibility"
  | "technical-skill"
  | "tool-or-platform"
  | "architecture"
  | "deployment"
  | "monitoring"
  | "performance"
  | "data"
  | "security"
  | "communication"
  | "collaboration"
  | "leadership"
  | "business-outcome"
  | "education"
  | "experience"
  | "other";

export type RequirementPriority = "critical" | "high" | "medium" | "low";

export type RequirementNecessity = "required" | "preferred" | "implied";

export interface RequirementEvidence {
  sourceText: string;
  startIndex: number;
  endIndex: number;
}

export interface JDRequirement {
  requirementId: string;
  sourceText: string;
  normalizedText: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  necessity: RequirementNecessity;
  evidence: RequirementEvidence[];
}

export interface RequirementExtractorInput {
  context: GenerationContext;
  jobDescription: JobDescription;
}

export interface RequirementExtractorOutput extends ContextualResult {
  requirements: JDRequirement[];
}

export interface RequirementExtractor {
  readonly name: string;
  execute(input: RequirementExtractorInput): Promise<RequirementExtractorOutput>;
}
