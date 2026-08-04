import type {
  CoverLetterEngine,
  CoverLetterEngineInput,
  CoverLetterEngineOutput,
} from "@resume/contracts";
import { ExperienceYearCalculator } from "../summary/analysis/experience-year-calculator";
import { SummaryKeywordAllocator } from "../summary/analysis/summary-keyword-allocator";
import { SummaryTargetRoleAnalyzer } from "../summary/analysis/summary-target-role-analyzer";
import {
  CoverLetterComposer,
  extractCompanyNameFromJd,
} from "./cover-letter-composer";

export interface CoverLetterEngineDependencies {
  targetRoleAnalyzer: SummaryTargetRoleAnalyzer;
  experienceYearCalculator: ExperienceYearCalculator;
  keywordAllocator: SummaryKeywordAllocator;
  composer: CoverLetterComposer;
}

export interface DefaultCoverLetterEngineOptions {
  engineVersion?: string;
  minimumWords?: number;
  maximumWords?: number;
}

export class DefaultCoverLetterEngine implements CoverLetterEngine {
  readonly name = "cover-letter-engine";
  readonly version: string;
  private readonly minimumWords: number;
  private readonly maximumWords: number;

  constructor(
    private readonly dependencies: CoverLetterEngineDependencies,
    options: DefaultCoverLetterEngineOptions = {},
  ) {
    this.version = options.engineVersion ?? "1.0.0";
    this.minimumWords = options.minimumWords ?? 120;
    this.maximumWords = options.maximumWords ?? 400;
  }

  async execute(input: CoverLetterEngineInput): Promise<CoverLetterEngineOutput> {
    this.assertInput(input);

    const targetRoleOutput = this.dependencies.targetRoleAnalyzer.execute({
      context: input.context,
      jobDescription: input.jobDescription,
    });

    const yearsOutput = this.dependencies.experienceYearCalculator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      careerHistory: input.profile.careerHistory,
      seniority: targetRoleOutput.targetRole.seniority,
    });

    const keywordOutput = this.dependencies.keywordAllocator.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      targetRole: targetRoleOutput.targetRole,
    });

    const companyName =
      input.companyName?.trim() ||
      extractCompanyNameFromJd(input.jobDescription.rawText);

    const composition = this.dependencies.composer.execute({
      profile: input.profile,
      targetRole: targetRoleOutput.targetRole,
      experienceYears: yearsOutput.experienceYears,
      keywords: keywordOutput.keywords,
      companyName,
      ...(input.highlightBullets ? { highlightBullets: input.highlightBullets } : {}),
    });

    const issues: CoverLetterEngineOutput["validation"]["issues"] = [];
    const wordCountApproved =
      composition.wordCount >= this.minimumWords &&
      composition.wordCount <= this.maximumWords;
    if (!wordCountApproved) {
      issues.push({
        issueCode: "WORD_COUNT",
        severity: "warning",
        message: `Cover letter word count ${composition.wordCount} is outside ${this.minimumWords}-${this.maximumWords}.`,
      });
    }
    const targetRolePresent = composition.coverLetter
      .toLocaleLowerCase()
      .includes(targetRoleOutput.targetRole.title.toLocaleLowerCase());
    if (!targetRolePresent) {
      issues.push({
        issueCode: "TARGET_ROLE_MISSING",
        severity: "error",
        message: "Cover letter is missing the target role title.",
      });
    }

    const approved =
      targetRolePresent &&
      composition.coverLetter.trim().length > 0 &&
      issues.every((issue) => issue.severity !== "error");

    return {
      context: input.context,
      engineName: this.name,
      engineVersion: this.version,
      status: approved ? "approved" : "rejected",
      coverLetter: composition.coverLetter,
      targetRole: targetRoleOutput.targetRole,
      experienceYears: yearsOutput.experienceYears,
      companyName,
      keywords: keywordOutput.keywords,
      wordCount: composition.wordCount,
      validation: {
        overallStatus: approved ? "approved" : "rejected",
        wordCountApproved,
        targetRolePresent,
        issues,
      },
    };
  }

  private assertInput(input: CoverLetterEngineInput): void {
    const matches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash &&
      input.context.profileId === input.profile.profileId;
    if (!matches) {
      throw new Error(
        "Cover letter engine input context does not match the supplied JD/profile.",
      );
    }
  }
}
