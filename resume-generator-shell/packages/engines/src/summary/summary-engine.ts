import type {
  SummaryEngine,
  SummaryEngineInput,
  SummaryEngineOutput,
} from "@resume/contracts";
import { ExperienceYearCalculator } from "./analysis/experience-year-calculator";
import { SummaryKeywordAllocator } from "./analysis/summary-keyword-allocator";
import { SummaryTargetRoleAnalyzer } from "./analysis/summary-target-role-analyzer";
import { SummaryComposer } from "./generation/summary-composer";
import { assertSummaryContextMatch } from "./types/context";
import { SummaryValidator } from "./validation/summary-validator";

export interface SummaryEngineDependencies {
  targetRoleAnalyzer: SummaryTargetRoleAnalyzer;
  experienceYearCalculator: ExperienceYearCalculator;
  keywordAllocator: SummaryKeywordAllocator;
  composer: SummaryComposer;
  validator: SummaryValidator;
}

export interface DefaultSummaryEngineOptions {
  engineVersion?: string;
  minimumWords?: number;
  maximumWords?: number;
  minimumReadinessScore?: number;
}

export class DefaultSummaryEngine implements SummaryEngine {
  readonly name = "summary-engine";
  readonly version: string;
  private readonly minimumWords: number;
  private readonly maximumWords: number;
  private readonly minimumReadinessScore: number;

  constructor(
    private readonly dependencies: SummaryEngineDependencies,
    options: DefaultSummaryEngineOptions = {},
  ) {
    this.version = options.engineVersion ?? "1.0.0";
    this.minimumWords = options.minimumWords ?? 50;
    this.maximumWords = options.maximumWords ?? 80;
    this.minimumReadinessScore = options.minimumReadinessScore ?? 90;
    if (this.minimumWords < 40 || this.maximumWords > 100 || this.minimumWords >= this.maximumWords) {
      throw new Error("Summary word limits must define a valid range between 40 and 100 words.");
    }
  }

  async execute(input: SummaryEngineInput): Promise<SummaryEngineOutput> {
    this.assertInput(input);

    const targetRoleOutput = this.dependencies.targetRoleAnalyzer.execute({
      context: input.context,
      jobDescription: input.jobDescription,
    });
    assertSummaryContextMatch(input.context, targetRoleOutput.context, this.dependencies.targetRoleAnalyzer.name);

    const yearsOutput = this.dependencies.experienceYearCalculator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      careerHistory: input.profile.careerHistory,
      seniority: targetRoleOutput.targetRole.seniority,
    });
    assertSummaryContextMatch(input.context, yearsOutput.context, this.dependencies.experienceYearCalculator.name);

    const keywordOutput = this.dependencies.keywordAllocator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      targetRole: targetRoleOutput.targetRole,
    });
    assertSummaryContextMatch(input.context, keywordOutput.context, this.dependencies.keywordAllocator.name);

    const composition = this.dependencies.composer.execute({
      context: input.context,
      targetRole: targetRoleOutput.targetRole,
      experienceYears: yearsOutput.experienceYears,
      keywords: keywordOutput.keywords,
    });
    assertSummaryContextMatch(input.context, composition.context, this.dependencies.composer.name);

    const validation = this.dependencies.validator.validate({
      jobDescription: input.jobDescription,
      summary: composition.summary,
      targetRole: targetRoleOutput.targetRole,
      experienceYears: yearsOutput.experienceYears,
      allocatedKeywords: keywordOutput.keywords,
      usedKeywords: composition.keywordsUsed,
      minimumWords: this.minimumWords,
      maximumWords: this.maximumWords,
    });

    const approved =
      validation.overallStatus === "approved" &&
      validation.resumeWordedReadinessScore >= this.minimumReadinessScore;

    return {
      context: input.context,
      engineName: this.name,
      engineVersion: this.version,
      status: approved ? "approved" : "rejected",
      summary: composition.summary,
      wordCount: composition.summary.trim().split(/\s+/).filter(Boolean).length,
      targetRole: targetRoleOutput.targetRole,
      experienceYears: yearsOutput.experienceYears,
      keywords: composition.keywordsUsed,
      validation: approved
        ? validation
        : {
            ...validation,
            overallStatus: "rejected",
            issues:
              validation.resumeWordedReadinessScore < this.minimumReadinessScore
                ? [
                    ...validation.issues,
                    {
                      issueCode: "READINESS_SCORE",
                      severity: "error",
                      message: `Summary readiness score ${validation.resumeWordedReadinessScore} is below ${this.minimumReadinessScore}.`,
                    },
                  ]
                : validation.issues,
          },
    };
  }

  private assertInput(input: SummaryEngineInput): void {
    const matches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash &&
      input.context.profileId === input.profile.profileId;
    if (!matches) {
      throw new Error(
        "Summary Engine input context does not match the supplied JD and profile.",
      );
    }
  }
}
