import type {
  ExperienceEngineOutput,
  GenerationContext,
  JobDescription,
} from "@resume/contracts";
import type { BulletPlanItem } from "./bullet-plan";
import type { ContextualResult } from "./context";
import type { KeywordPackage } from "./keyword-package";
import type { StarStory } from "./star-story";

export type ExperienceBullet =
  ExperienceEngineOutput["experiences"][number]["bullets"][number];

export type BulletSentencePattern =
  | "action-metric-outcome"
  | "action-outcome-metric"
  | "action-metric-while-outcome"
  | "action-delivered-impact"
  | "action-metric-business-impact";

export interface BulletSentenceDiagnostic {
  bulletId: string;
  experienceId: string;
  sentencePattern: BulletSentencePattern;
  wordCount: number;
  sentenceCount: number;
  startsWithAllocatedActionVerb: boolean;
  directKeywordCoverage: boolean;
  supportingKeywordCoverage: boolean;
  outcomeKeywordCoverage: boolean;
  quantifiedImpactPresent: boolean;
  activeVoice: boolean;
  firstPersonFree: boolean;
  weakLanguageFree: boolean;
  punctuationValid: boolean;
  communicationSignalPresent: boolean;
  leadershipSignalPresent: boolean;
  strengthScore: number;
  distinctivenessScore: number;
  warnings: string[];
  errors: string[];
}

export interface BulletCompositionValidation {
  allPlansCovered: boolean;
  bulletCountMatchesPlanCount: boolean;
  allBulletIdsUnique: boolean;
  allStoriesApproved: boolean;
  allBulletsSingleSentence: boolean;
  allBulletsStartWithAllocatedVerbs: boolean;
  allDirectKeywordsRepresented: boolean;
  allSupportingKeywordsUsed: boolean;
  allOutcomesUsed: boolean;
  allBulletsQuantified: boolean;
  allBulletsConcise: boolean;
  allBulletsStrong: boolean;
  allBulletsDistinctive: boolean;
  sentencePatternsVariedWithinRoles: boolean;
  communicationCoveragePreserved: boolean;
  leadershipCoveragePreserved: boolean;
  duplicateBulletIds: string[];
  missingPlanBulletIds: string[];
  weakBulletIds: string[];
  lowDistinctivenessBulletIds: string[];
  overlongBulletIds: string[];
  underlengthBulletIds: string[];
  repeatedSentencePatterns: string[];
  duplicateFinalBullets: string[];
  diagnostics: BulletSentenceDiagnostic[];
  warnings: string[];
  errors: string[];
  overallStatus: "approved" | "rejected";
}

export interface BulletComposerInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  reservedBullets?: ExperienceBullet[];
  regenerationAttempt?: number;
}

export interface BulletComposerOutput extends ContextualResult {
  bullets: ExperienceBullet[];
  validation?: BulletCompositionValidation;
}

export interface BulletComposer {
  readonly name: string;
  execute(input: BulletComposerInput): Promise<BulletComposerOutput>;
}
