import type { BulletPlanItem } from "../types/bullet-plan";
import type {
  BulletCompositionValidation,
  BulletSentencePattern,
  ExperienceBullet,
} from "../types/composed-bullet";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarStory } from "../types/star-story";
import { canonicalKeywordKey } from "../keywords/keyword-normalizer";
import { SentenceQualityValidator } from "./sentence-quality-validator";

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function distinctivenessScores(input: {
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  bullets: ExperienceBullet[];
  patternsByBullet: ReadonlyMap<string, BulletSentencePattern>;
}): Map<string, number> {
  const plansByBullet = new Map(input.plans.map((item) => [item.bulletId, item]));
  const packagesByBullet = new Map(input.keywordPackages.map((item) => [item.bulletId, item]));
  const storiesByBullet = new Map(input.stories.map((item) => [item.bulletId, item]));
  const bulletsByRole = new Map<string, ExperienceBullet[]>();
  for (const bullet of input.bullets) {
    const plan = plansByBullet.get(bullet.bulletId);
    if (!plan) continue;
    const roleBullets = bulletsByRole.get(plan.experienceId) ?? [];
    roleBullets.push(bullet);
    bulletsByRole.set(plan.experienceId, roleBullets);
  }

  const scores = new Map<string, number>();
  for (const [experienceId, roleBullets] of bulletsByRole) {
    const patternCounts = new Map<BulletSentencePattern, number>();
    const openingCounts = new Map<string, number>();
    const metricCounts = new Map<string, number>();
    const dimensionCounts = new Map<string, number>();
    for (const bullet of roleBullets) {
      const plan = plansByBullet.get(bullet.bulletId);
      const keywordPackage = packagesByBullet.get(bullet.bulletId);
      const story = storiesByBullet.get(bullet.bulletId);
      const pattern = input.patternsByBullet.get(bullet.bulletId);
      if (!plan || !keywordPackage || !story || !pattern) continue;
      patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
      const opening = canonicalKeywordKey(
        bullet.finalBullet.split(/\s+/).slice(0, 4).join(" "),
      );
      openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
      const metric = story.metrics[0];
      const metricKey = metric
        ? `${metric.metricType}:${metric.direction}:${metric.unit}:${canonicalKeywordKey(metric.measure)}`
        : "missing";
      metricCounts.set(metricKey, (metricCounts.get(metricKey) ?? 0) + 1);
      dimensionCounts.set(
        plan.achievementDimension,
        (dimensionCounts.get(plan.achievementDimension) ?? 0) + 1,
      );
    }

    for (const bullet of roleBullets) {
      const plan = plansByBullet.get(bullet.bulletId);
      const keywordPackage = packagesByBullet.get(bullet.bulletId);
      const story = storiesByBullet.get(bullet.bulletId);
      const pattern = input.patternsByBullet.get(bullet.bulletId);
      if (!plan || !keywordPackage || !story || !pattern) {
        scores.set(bullet.bulletId, 0);
        continue;
      }
      let score = 10;
      const opening = canonicalKeywordKey(
        bullet.finalBullet.split(/\s+/).slice(0, 4).join(" "),
      );
      const metric = story.metrics[0];
      const metricKey = metric
        ? `${metric.metricType}:${metric.direction}:${metric.unit}:${canonicalKeywordKey(metric.measure)}`
        : "missing";
      if ((patternCounts.get(pattern) ?? 0) > 2) score -= 0.6;
      if ((openingCounts.get(opening) ?? 0) > 1) score -= 1.4;
      if ((metricCounts.get(metricKey) ?? 0) > 1) score -= 1.4;
      if ((dimensionCounts.get(plan.achievementDimension) ?? 0) > 1) score -= 0.8;
      const sameText = roleBullets.filter(
        (other) =>
          canonicalKeywordKey(other.finalBullet) ===
          canonicalKeywordKey(bullet.finalBullet),
      ).length;
      if (sameText > 1) score -= 4;
      const sameVerb = roleBullets.filter((other) => {
        const otherPackage = packagesByBullet.get(other.bulletId);
        return otherPackage?.actionVerbCanonicalKey === keywordPackage.actionVerbCanonicalKey;
      }).length;
      if (sameVerb > 1) score -= 1.5;
      scores.set(bullet.bulletId, Math.round(Math.max(0, score) * 10) / 10);
    }
    void experienceId;
  }
  return scores;
}

export function validateBulletComposition(input: {
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
  bullets: ExperienceBullet[];
  patternsByBullet: ReadonlyMap<string, BulletSentencePattern>;
  sentenceQualityValidator: SentenceQualityValidator;
}): BulletCompositionValidation {
  const planIds = new Set(input.plans.map((item) => item.bulletId));
  const packageByBullet = new Map(input.keywordPackages.map((item) => [item.bulletId, item]));
  const storyByBullet = new Map(input.stories.map((item) => [item.bulletId, item]));
  const planByBullet = new Map(input.plans.map((item) => [item.bulletId, item]));
  const duplicateBulletIds = duplicates(input.bullets.map((item) => item.bulletId));
  const missingPlanBulletIds = [...planIds].filter(
    (bulletId) => !input.bullets.some((bullet) => bullet.bulletId === bulletId),
  );
  const duplicateFinalBullets = duplicates(
    input.bullets.map((item) => canonicalKeywordKey(item.finalBullet)),
  );
  const distinctiveness = distinctivenessScores(input);
  const diagnostics = input.bullets.map((bullet) => {
    const plan = planByBullet.get(bullet.bulletId);
    const keywordPackage = packageByBullet.get(bullet.bulletId);
    const story = storyByBullet.get(bullet.bulletId);
    const pattern = input.patternsByBullet.get(bullet.bulletId);
    if (!plan || !keywordPackage || !story || !pattern) {
      throw new Error(`Composition validation cannot resolve ${bullet.bulletId}.`);
    }
    return input.sentenceQualityValidator.validate({
      plan,
      keywordPackage,
      story,
      bullet,
      sentencePattern: pattern,
      distinctivenessScore: distinctiveness.get(bullet.bulletId) ?? 0,
    });
  });

  const patternsByRole = new Map<string, BulletSentencePattern[]>();
  for (const diagnostic of diagnostics) {
    const current = patternsByRole.get(diagnostic.experienceId) ?? [];
    current.push(diagnostic.sentencePattern);
    patternsByRole.set(diagnostic.experienceId, current);
  }
  const repeatedSentencePatterns = [...patternsByRole.entries()].flatMap(
    ([experienceId, patterns]) => {
      const counts = new Map<BulletSentencePattern, number>();
      for (const pattern of patterns) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
      return [...counts.entries()]
        .filter(([, count]) => count > 2)
        .map(([pattern, count]) => `${experienceId}:${pattern}:${count}`);
    },
  );
  const weakBulletIds = diagnostics
    .filter((item) => item.strengthScore < 8 || item.errors.length > 0)
    .map((item) => item.bulletId);
  const lowDistinctivenessBulletIds = diagnostics
    .filter((item) => item.distinctivenessScore < 8)
    .map((item) => item.bulletId);
  const overlongBulletIds = diagnostics
    .filter((item) => item.wordCount > input.sentenceQualityValidator.maximumWords)
    .map((item) => item.bulletId);
  const underlengthBulletIds = diagnostics
    .filter((item) => item.wordCount < input.sentenceQualityValidator.minimumWords)
    .map((item) => item.bulletId);
  const communicationPlans = input.plans.filter((item) => item.communicationFocused);
  const leadershipPlans = input.plans.filter((item) => item.leadershipFocused);
  const communicationCoveragePreserved = communicationPlans.every((plan) =>
    diagnostics.find((item) => item.bulletId === plan.bulletId)?.communicationSignalPresent,
  );
  const leadershipCoveragePreserved = leadershipPlans.every((plan) =>
    diagnostics.find((item) => item.bulletId === plan.bulletId)?.leadershipSignalPresent,
  );

  const warnings = diagnostics.flatMap((item) =>
    item.warnings.map((warning) => `${item.bulletId}: ${warning}`),
  );
  if (repeatedSentencePatterns.length > 0) {
    warnings.push("Some sentence patterns appear more than twice within one role.");
  }
  const errors: string[] = [];
  if (missingPlanBulletIds.length > 0) errors.push("One or more bullet plans were not composed.");
  if (duplicateBulletIds.length > 0) errors.push("Composed bullet IDs are duplicated.");
  if (duplicateFinalBullets.length > 0) errors.push("Final bullet text is duplicated.");
  if (input.stories.some((story) => story.status !== "approved")) errors.push("A rejected STAR story reached composition.");
  if (weakBulletIds.length > 0) errors.push("One or more composed bullets failed sentence-strength validation.");
  if (lowDistinctivenessBulletIds.length > 0) errors.push("One or more bullets are not distinctive enough within the role.");
  if (!communicationCoveragePreserved) errors.push("Communication coverage was lost during composition.");
  if (!leadershipCoveragePreserved) errors.push("Leadership coverage was lost during composition.");

  return {
    allPlansCovered: missingPlanBulletIds.length === 0,
    bulletCountMatchesPlanCount: input.bullets.length === input.plans.length,
    allBulletIdsUnique: duplicateBulletIds.length === 0,
    allStoriesApproved: input.stories.every((story) => story.status === "approved"),
    allBulletsSingleSentence: diagnostics.every((item) => item.sentenceCount === 1 && item.punctuationValid),
    allBulletsStartWithAllocatedVerbs: diagnostics.every((item) => item.startsWithAllocatedActionVerb),
    allDirectKeywordsRepresented: diagnostics.every((item) => item.directKeywordCoverage),
    allSupportingKeywordsUsed: diagnostics.every((item) => item.supportingKeywordCoverage),
    allOutcomesUsed: diagnostics.every((item) => item.outcomeKeywordCoverage),
    allBulletsQuantified: diagnostics.every((item) => item.quantifiedImpactPresent),
    allBulletsConcise: overlongBulletIds.length === 0 && underlengthBulletIds.length === 0,
    allBulletsStrong: weakBulletIds.length === 0,
    allBulletsDistinctive: lowDistinctivenessBulletIds.length === 0,
    sentencePatternsVariedWithinRoles: repeatedSentencePatterns.length === 0,
    communicationCoveragePreserved,
    leadershipCoveragePreserved,
    duplicateBulletIds,
    missingPlanBulletIds,
    weakBulletIds,
    lowDistinctivenessBulletIds,
    overlongBulletIds,
    underlengthBulletIds,
    repeatedSentencePatterns,
    duplicateFinalBullets,
    diagnostics,
    warnings,
    errors,
    overallStatus: errors.length === 0 ? "approved" : "rejected",
  };
}
