import type {
  BulletComposer,
  BulletComposerInput,
  BulletComposerOutput,
  BulletSentencePattern,
  ExperienceBullet,
} from "../types/composed-bullet";
import {
  buildActionClause,
  directKeywordRepresented,
  isJdMarketingOrMetaScope,
  stripFirstPersonPronouns,
  substantiveKeyword,
} from "./bullet-language";
import { validateBulletComposition } from "./bullet-composition-validator";
import {
  endingSkeleton,
  SentencePatternEngine,
} from "./sentence-pattern-engine";
import {
  SentenceQualityValidator,
  type SentenceQualityValidatorOptions,
} from "./sentence-quality-validator";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";

function uniqueSubstantiveKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const keyword of keywords) {
    const substantive = substantiveKeyword(stripFirstPersonPronouns(keyword));
    if (!substantive || isJdMarketingOrMetaScope(substantive)) {
      continue;
    }
    const key = canonicalKeywordKey(substantive);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(substantive);
  }
  return selected;
}

function registerVisibleMultiWordScopes(
  text: string,
  usedKeys: Set<string>,
): void {
  const cleaned = stripFirstPersonPronouns(text)
    .replace(/[.!?]+$/g, "")
    .replace(/\s+(?:using|through)\s+.+$/i, "")
    .trim();
  const key = canonicalKeywordKey(substantiveKeyword(cleaned));
  if (key && key.split("|").length >= 2) {
    usedKeys.add(key);
  }
  // Also lock significant 3+ word windows to stop near-clone scopes.
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (let index = 0; index < words.length - 2; index += 1) {
    const window = words.slice(index, index + 3).join(" ");
    const windowKey = canonicalKeywordKey(substantiveKeyword(window));
    if (windowKey) usedKeys.add(windowKey);
  }
}

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
    const usedDirectScopeKeys = new Set<string>();
    const usedConnectors = new Set<string>();
    const usedEndingSkeletons = new Set<string>();

    // Preserve uniqueness against bullets kept during selective regeneration.
    for (const reserved of input.reservedBullets ?? []) {
      for (const keyword of reserved.directKeywords) {
        const key = canonicalKeywordKey(substantiveKeyword(keyword));
        if (key) usedDirectScopeKeys.add(key);
      }
      usedEndingSkeletons.add(endingSkeleton(reserved.finalBullet));
    }

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

      // Keep only unused direct JD phrases in the visible bullet so the same
      // noun phrase (e.g. "data pipelines") is not cloned across experiences.
      // Claim the substantive form that composition actually inserts into text.
      // Drop soft-skill buzzphrases so they cannot be forced back via
      // "covering …" when the action scope was rewritten to concrete work.
      const visibleDirectKeywords = uniqueSubstantiveKeywords(
        keywordPackage.directKeywords.filter((keyword) => {
          if (
            /\b(?:(?:strong|excellent|good|proven)\s+)?(?:verbal and written\s+)?communication skills\b/i.test(
              keyword,
            ) ||
            /\b(?:soft skills|interpersonal skills|people skills)\b/i.test(keyword)
          ) {
            return false;
          }
          const key = canonicalKeywordKey(substantiveKeyword(keyword));
          return Boolean(key) && !usedDirectScopeKeys.has(key);
        }).map((keyword) => {
          if (/^mentor/i.test(keywordPackage.actionVerb) && /\bmentoring\b/i.test(keyword)) {
            return keyword.replace(/\bmentoring\b/gi, "capability building");
          }
          return keyword;
        }),
      );
      const rewrittenSupporting = keywordPackage.supportingKeywords
        .map((keyword) => stripFirstPersonPronouns(keyword))
        .map((keyword) => {
          if (
            /\b(?:(?:strong|excellent|good|proven)\s+)?(?:verbal and written\s+)?communication skills\b/i.test(
              keyword,
            ) ||
            /\b(?:soft skills|interpersonal skills|people skills)\b/i.test(keyword)
          ) {
            return "stakeholder communication";
          }
          if (
            /^(?:coordinat|automat)/i.test(keywordPackage.actionVerb) &&
            /\bcoordination\b/i.test(keyword)
          ) {
            return keyword.replace(/\bcoordination\b/gi, "planning");
          }
          if (/^align/i.test(keywordPackage.actionVerb) && /\balignment\b/i.test(keyword)) {
            return keyword.replace(/\balignment\b/gi, "planning");
          }
          if (/^mentor/i.test(keywordPackage.actionVerb) && /\bmentoring\b/i.test(keyword)) {
            return keyword.replace(/\bmentoring\b/gi, "capability building");
          }
          return keyword;
        })
        .filter(
          (keyword) => Boolean(keyword) && !isJdMarketingOrMetaScope(keyword),
        );
      const compositionPackage = {
        ...keywordPackage,
        directKeywords: visibleDirectKeywords,
        supportingKeywords: rewrittenSupporting,
        outcomeKeywords: keywordPackage.outcomeKeywords
          .map((keyword) => stripFirstPersonPronouns(keyword))
          .filter(Boolean),
        supportingKeywordDetails: keywordPackage.supportingKeywordDetails.map((detail) => {
          let keyword = stripFirstPersonPronouns(detail.keyword);
          if (
            /^(?:coordinat|automat)/i.test(keywordPackage.actionVerb) &&
            /\bcoordination\b/i.test(keyword)
          ) {
            keyword = keyword.replace(/\bcoordination\b/gi, "planning");
          }
          if (/^align/i.test(keywordPackage.actionVerb) && /\balignment\b/i.test(keyword)) {
            keyword = keyword.replace(/\balignment\b/gi, "planning");
          }
          if (/^mentor/i.test(keywordPackage.actionVerb) && /\bmentoring\b/i.test(keyword)) {
            keyword = keyword.replace(/\bmentoring\b/gi, "capability building");
          }
          return { ...detail, keyword };
        }),
        directKeywordEvidence: keywordPackage.directKeywordEvidence.filter((evidence) =>
          visibleDirectKeywords.some(
            (keyword) =>
              canonicalKeywordKey(substantiveKeyword(keyword)) ===
              canonicalKeywordKey(substantiveKeyword(evidence.keyword)),
          ),
        ),
      };

      let actionClause = buildActionClause({
        plan,
        keywordPackage: compositionPackage,
        story,
        usedScopeKeys: usedDirectScopeKeys,
      });
      for (const keyword of keywordPackage.directKeywords) {
        const key = canonicalKeywordKey(substantiveKeyword(keyword));
        if (key) usedDirectScopeKeys.add(key);
      }
      // Lock the visible action-object phrase so later bullets cannot clone the
      // same multi-word scope (e.g. "stakeholder alignment and delivery ...").
      const actionObject = actionClause
        .replace(new RegExp(`^${keywordPackage.actionVerb}\\s+`, "i"), "")
        .replace(/\s+(?:using|through)\s+.+$/i, "")
        .trim();
      const actionObjectKey = canonicalKeywordKey(substantiveKeyword(actionObject));
      if (actionObjectKey) usedDirectScopeKeys.add(actionObjectKey);
      registerVisibleMultiWordScopes(actionClause, usedDirectScopeKeys);

      let composed = this.sentencePatternEngine.compose({
        actionClause,
        plan,
        keywordPackage: compositionPackage,
        story,
        minimumWords: this.sentenceQualityValidator.minimumWords,
        maximumWords: this.sentenceQualityValidator.maximumWords,
        patternOffset: input.regenerationAttempt ?? 0,
        usedConnectors,
        usedEndingSkeletons,
      });

      const missingDirects = visibleDirectKeywords.filter(
        (keyword) => !directKeywordRepresented(composed.finalBullet, keyword),
      );
      if (missingDirects.length > 0) {
        const coveringScopes = missingDirects
          .map((keyword) => substantiveKeyword(keyword))
          .filter(
            (scope) => Boolean(scope) && !isJdMarketingOrMetaScope(scope),
          );
        if (coveringScopes.length > 0) {
          actionClause = `${actionClause.replace(/[.!?]+$/g, "")} covering ${coveringScopes.join(" and ")}`;
          composed = this.sentencePatternEngine.compose({
            actionClause,
            plan,
            keywordPackage: compositionPackage,
            story,
            minimumWords: this.sentenceQualityValidator.minimumWords,
            maximumWords: this.sentenceQualityValidator.maximumWords,
            patternOffset: (input.regenerationAttempt ?? 0) + 1,
            usedConnectors,
            usedEndingSkeletons,
          });
        }
      }

      for (const connector of composed.connectors) {
        usedConnectors.add(connector);
      }
      usedEndingSkeletons.add(endingSkeleton(composed.finalBullet));

      // Only claim directs that survived composition/compression so sentence
      // validation cannot reject the bullet for truncated JD phrases.
      const representedDirectKeywords = visibleDirectKeywords.filter((keyword) =>
        directKeywordRepresented(composed.finalBullet, keyword),
      );
      const representedSupportingKeywords = compositionPackage.supportingKeywords.filter(
        (keyword) => directKeywordRepresented(composed.finalBullet, keyword),
      );
      // Outcomes must appear verbatim — concept matching can false-positive on
      // shared stems (e.g. "engineering velocity" vs "team delivery velocity").
      const representedOutcomeKeywords = compositionPackage.outcomeKeywords.filter(
        (keyword) =>
          composed.finalBullet
            .toLocaleLowerCase()
            .includes(stripFirstPersonPronouns(keyword).toLocaleLowerCase()),
      );

      patternsByBullet.set(plan.bulletId, composed.sentencePattern);


      drafts.push({
        bulletId: plan.bulletId,
        requirementId: plan.requirementId,
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        actionVerb: keywordPackage.actionVerb,
directKeywords: representedDirectKeywords,
        supportingKeywords: representedSupportingKeywords,
        outcomeKeywords: representedOutcomeKeywords,
        finalBullet: composed.finalBullet,
        strengthScore: 0,
        distinctivenessScore: 0,
        status: "approved",
      });
    }

    const validation = validateBulletComposition({
      plans: input.plans,
      keywordPackages: drafts.map((bullet) => {
        const original = packagesByBullet.get(bullet.bulletId);
        if (!original) {
          throw new Error(`Missing keyword package for composed bullet ${bullet.bulletId}.`);
        }
        return {
          ...original,
          directKeywords: bullet.directKeywords,
          supportingKeywords: bullet.supportingKeywords,
          outcomeKeywords: bullet.outcomeKeywords,
        };
      }),
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
