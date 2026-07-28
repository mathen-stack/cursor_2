import type {
  SkillCategory,
  SkillsEngine,
  SkillsEngineInput,
  SkillsEngineOutput,
} from "@resume/contracts";
import { ExplicitSkillExtractor } from "./extraction/explicit-skill-extractor";
import { matchSkillKeysFromExperienceKeywords } from "./experience-skill-evidence";
import { SupportingSkillInferenceEngine } from "./inference/supporting-skill-inference-engine";
import { SkillRankingEngine } from "./ranking/skill-ranking-engine";
import { SKILL_CATEGORY_ORDER } from "./skill-taxonomy";
import { assertSkillsContextMatch } from "./types/context";
import { SkillsValidator } from "./validation/skills-validator";

export interface DefaultSkillsEngineOptions {
  engineVersion?: string;
  minimumSkills?: number;
  maximumSkills?: number;
}

export interface SkillsEngineDependencies {
  explicitSkillExtractor: ExplicitSkillExtractor;
  supportingSkillInferenceEngine: SupportingSkillInferenceEngine;
  skillRankingEngine: SkillRankingEngine;
  skillsValidator: SkillsValidator;
}

function buildCategories(
  skills: SkillsEngineOutput["skills"],
): SkillCategory[] {
  const grouped = new Map<string, string[]>();
  for (const skill of skills) {
    const current = grouped.get(skill.category) ?? [];
    current.push(skill.name);
    grouped.set(skill.category, current);
  }

  return SKILL_CATEGORY_ORDER.flatMap((category) => {
    const categorySkills = grouped.get(category);
    return categorySkills && categorySkills.length > 0
      ? [{ name: category, skills: categorySkills }]
      : [];
  });
}

export class DefaultSkillsEngine implements SkillsEngine {
  readonly name = "skills-engine";
  readonly version: string;
  private readonly minimumSkills: number;
  private readonly maximumSkills: number;

  constructor(
    private readonly dependencies: SkillsEngineDependencies,
    options: DefaultSkillsEngineOptions = {},
  ) {
    this.version = options.engineVersion ?? "1.0.0";
    this.minimumSkills = options.minimumSkills ?? 6;
    this.maximumSkills = options.maximumSkills ?? 32;
    if (this.minimumSkills < 4) {
      throw new Error("minimumSkills must be at least 4.");
    }
    if (this.maximumSkills < this.minimumSkills || this.maximumSkills > 40) {
      throw new Error("maximumSkills must be between minimumSkills and 40.");
    }
  }

  async execute(input: SkillsEngineInput): Promise<SkillsEngineOutput> {
    this.assertInput(input);

    const explicit = await this.dependencies.explicitSkillExtractor.execute({
      context: input.context,
      jobDescription: input.jobDescription,
    });
    assertSkillsContextMatch(
      input.context,
      explicit.context,
      this.dependencies.explicitSkillExtractor.name,
    );

    const inferred = await this.dependencies.supportingSkillInferenceEngine.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      explicitCandidates: explicit.candidates,
    });
    assertSkillsContextMatch(
      input.context,
      inferred.context,
      this.dependencies.supportingSkillInferenceEngine.name,
    );

    const experienceEvidenceKeys = matchSkillKeysFromExperienceKeywords(
      input.experienceKeywordHints ?? [],
    );

    const ranked = await this.dependencies.skillRankingEngine.execute({
      context: input.context,
      jobDescription: input.jobDescription,
      candidates: [...explicit.candidates, ...inferred.candidates],
      maximumSkills: this.maximumSkills,
      experienceEvidenceKeys,
    });
    assertSkillsContextMatch(
      input.context,
      ranked.context,
      this.dependencies.skillRankingEngine.name,
    );

    const categories = buildCategories(ranked.selected);
    const validation = this.dependencies.skillsValidator.validate({
      jobDescription: input.jobDescription,
      explicitCandidates: explicit.candidates,
      selected: ranked.selected,
      categories,
      minimumSkills: this.minimumSkills,
      maximumSkills: this.maximumSkills,
    });

    return {
      context: input.context,
      engineName: this.name,
      engineVersion: this.version,
      status: validation.overallStatus === "approved" ? "approved" : "rejected",
      categories,
      skills: ranked.selected,
      validation: {
        ...validation,
        omittedLowPrioritySkills: ranked.omittedLowPrioritySkills,
      },
    };
  }

  private assertInput(input: SkillsEngineInput): void {
    const matches =
      input.context.jdId === input.jobDescription.jdId &&
      input.context.jdHash === input.jobDescription.contentHash &&
      input.context.profileId === input.profile.profileId;
    if (!matches) {
      throw new Error(
        "Skills Engine input context does not match the supplied JD and profile.",
      );
    }
  }
}
