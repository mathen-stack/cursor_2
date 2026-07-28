import type {
  GeneratedSkill,
  GenerationContext,
  JobDescription,
  SkillEvidence,
  SkillPriority,
  SkillSource,
} from "@resume/contracts";
import type { SkillCategoryName } from "../skill-taxonomy";

export interface SkillCandidate {
  key: string;
  name: string;
  category: SkillCategoryName;
  source: SkillSource;
  priority: SkillPriority;
  score: number;
  evidence: SkillEvidence[];
  inferredFrom: string[];
  mentionCount: number;
}

export interface SkillExtractionInput {
  context: GenerationContext;
  jobDescription: JobDescription;
}

export interface SkillExtractionOutput {
  context: GenerationContext;
  candidates: SkillCandidate[];
}

export interface SkillInferenceInput extends SkillExtractionInput {
  explicitCandidates: SkillCandidate[];
}

export interface SkillRankingInput extends SkillExtractionInput {
  candidates: SkillCandidate[];
  maximumSkills: number;
  /** Catalog skill keys evidenced by experience bullet keywords. */
  experienceEvidenceKeys?: ReadonlySet<string>;
}

export interface SkillRankingOutput {
  context: GenerationContext;
  selected: GeneratedSkill[];
  omittedLowPrioritySkills: string[];
}
