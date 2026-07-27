import type {
  BulletComposer,
  BulletComposerInput,
  BulletComposerOutput,
  BulletSentencePattern,
  ExperienceBullet,
} from "../types/composed-bullet";
import { buildActionClause } from "./bullet-language";
import { validateBulletComposition } from "./bullet-composition-validator";
import { SentencePatternEngine } from "./sentence-pattern-engine";
import {
  SentenceQualityValidator,
  type SentenceQualityValidatorOptions,
} from "./sentence-quality-validator";

export interface RealBulletComposerOptions extends SentenceQualityValidatorOptions {
  sentencePatternEngine?: SentencePatternEngine;
  sentenceQualityValidator?: SentenceQualityValidator;
}

export class RealBulletComposer implements BulletComposer {
  readonly name = "real-compressed-star-bullet-composer";

  private readonly sentencePatternEngine: SentencePatternEngine;
  private readonly sentenceQualityValidator: SentenceQualityValidator;

  constructor(options: RealBulletComposerOptions = {}) {
    this.sentencePatternEngine =
      options.sentencePatternEngine ?? new SentencePatternEngine();
    this.sentenceQualityValidator =
      options.sentenceQualityValidator ?? new SentenceQualityValidator(options);
  }

  async execute(input: BulletComposerInput): Promise<BulletComposerOutput> {
    this.assertInput(input);
    const packagesByBullet = new Map(
      input.keywordPackages.map((item) => [item.bulletId, item]),
    );
    const storiesByBullet = new Map(
      input.stories.map((item) => [item.bulletId, item]),
    );
    const patternsByBullet = new Map<string, BulletSentencePattern>();
    const drafts: ExperienceBullet[] = [];

    const orderedPlans = [...input.plans].sort(
      (left, right) =>
        left.experienceId.localeCompare(right.experienceId) ||
        left.sequence - right.sequence ||
        left.bulletId.localeCompare(right.bulletId),
    );

    for (const plan of orderedPlans) {
      const keywordPackage = packagesByBullet.get(plan.bulletId);
      const story = storiesByBullet.get(plan.bulletId);
      if (!keywordPackage || !story) {
        throw new Error(`Bullet composition input is incomplete for ${plan.bulletId}.`);
      }
      if (
        keywordPackage.experienceId !== plan.experienceId ||
        keywordPackage.requirementId !== plan.requirementId ||
        story.experienceId !== plan.experienceId ||
        story.requirementId !== plan.requirementId
      ) {
        throw new Error(`Bullet composition rejected mismatched data for ${plan.bulletId}.`);
      }
      if (story.status !== "approved") {
        throw new Error(`Bullet composition rejected unapproved STAR story ${plan.bulletId}.`);
      }

      const actionClause = buildActionClause({ plan, keywordPackage, story });
      const composed = this.sentencePatternEngine.compose({
        actionClause,
        plan,
        keywordPackage,
        story,
        maximumWords: this.sentenceQualityValidator.maximumWords,
        patternOffset: input.regenerationAttempt ?? 0,
      });
      patternsByBullet.set(plan.bulletId, composed.sentencePattern);
      drafts.push({
        bulletId: plan.bulletId,
        requirementId: plan.requirementId,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        actionVerb: keywordPackage.actionVerb,
        directKeywords: [...keywordPackage.directKeywords],
        supportingKeywords: [...keywordPackage.supportingKeywords],
        outcomeKeywords: [...keywordPackage.outcomeKeywords],
        finalBullet: composed.finalBullet,
        strengthScore: 0,
        distinctivenessScore: 0,
        status: "approved",
      });
    }

    const validation = validateBulletComposition({
      plans: input.plans,
      keywordPackages: input.keywordPackages,
      stories: input.stories,
      bullets: drafts,
      patternsByBullet,
      sentenceQualityValidator: this.sentenceQualityValidator,
    });
    if (validation.overallStatus !== "approved") {
      throw new Error(
        `Compressed STAR bullet composition failed validation: ${validation.errors.join(" ")} ${validation.diagnostics
          .filter((item) => item.errors.length > 0)
          .map((item) => `${item.bulletId}: ${item.errors.join(" ")}`)
          .join(" ")}`.trim(),
      );
    }

    const diagnosticByBullet = new Map(
      validation.diagnostics.map((item) => [item.bulletId, item]),
    );
    const bullets = drafts.map((bullet) => {
      const diagnostic = diagnosticByBullet.get(bullet.bulletId);
      if (!diagnostic) {
        throw new Error(`Missing composition diagnostic for ${bullet.bulletId}.`);
      }
      return {
        ...bullet,
        strengthScore: diagnostic.strengthScore,
        distinctivenessScore: diagnostic.distinctivenessScore,
        status:
          diagnostic.errors.length === 0 &&
          diagnostic.strengthScore >= this.sentenceQualityValidator.minimumStrengthScore &&
          diagnostic.distinctivenessScore >= 8
            ? "approved" as const
            : "rejected" as const,
      };
    });

    return {
      context: input.context,
      bullets,
      validation,
    };
  }

  private assertInput(input: BulletComposerInput): void {
    if (
      input.context.jdId !== input.jobDescription.jdId ||
      input.context.jdHash !== input.jobDescription.contentHash
    ) {
      throw new Error("Bullet Composer input context does not match the supplied JD.");
    }
    const reservedIds = new Set((input.reservedBullets ?? []).map((item) => item.bulletId));
    for (const plan of input.plans) {
      if (reservedIds.has(plan.bulletId)) {
        throw new Error(`Bullet Composer cannot regenerate reserved bullet ${plan.bulletId}.`);
      }
    }
    if (input.plans.length === 0) {
      throw new Error("Bullet Composer requires at least one bullet plan.");
    }
    if (
      input.keywordPackages.length !== input.plans.length ||
      input.stories.length !== input.plans.length
    ) {
      throw new Error("Bullet Composer requires one keyword package and STAR story per plan.");
    }
    const planIds = input.plans.map((item) => item.bulletId);
    const packageIds = input.keywordPackages.map((item) => item.bulletId);
    const storyIds = input.stories.map((item) => item.bulletId);
    if (new Set(planIds).size !== planIds.length) {
      throw new Error("Bullet Composer received duplicate bullet plan IDs.");
    }
    if (new Set(packageIds).size !== packageIds.length) {
      throw new Error("Bullet Composer received duplicate keyword package IDs.");
    }
    if (new Set(storyIds).size !== storyIds.length) {
      throw new Error("Bullet Composer received duplicate STAR story IDs.");
    }
  }
}
