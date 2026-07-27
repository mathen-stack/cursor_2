import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { StarGenerationValidation, StarStory } from "../types/star-story";
import { includesCaseInsensitive } from "./star-utils";

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function validateStarGeneration(input: {
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  requirements: JDRequirement[];
  stories: StarStory[];
}): StarGenerationValidation {
  const planIds = new Set(input.plans.map((plan) => plan.bulletId));
  const requirementIds = new Set(input.requirements.map((requirement) => requirement.requirementId));
  const packageByBullet = new Map(input.keywordPackages.map((item) => [item.bulletId, item]));
  const planByBullet = new Map(input.plans.map((item) => [item.bulletId, item]));
  const storyIds = input.stories.map((story) => story.bulletId);
  const duplicateStoryIds = duplicates(storyIds);
  const missingPlanBulletIds = [...planIds].filter(
    (bulletId) => !input.stories.some((story) => story.bulletId === bulletId),
  );
  const unknownRequirementIds = input.stories
    .filter((story) => !requirementIds.has(story.requirementId))
    .map((story) => story.requirementId);
  const actionVerbErrors: string[] = [];
  const missingDirectKeywordUsages: string[] = [];
  const missingSupportingKeywordUsages: string[] = [];
  const missingOutcomeKeywordUsages: string[] = [];
  const incoherentStoryIds: string[] = [];
  const implausibleMetricIds: string[] = [];
  const communicationStoryErrors: string[] = [];
  const leadershipStoryErrors: string[] = [];
  const metricPatternsByRole = new Map<string, Set<string>>();
  const repeatedMetricPatterns: string[] = [];

  for (const story of input.stories) {
    const keywordPackage = packageByBullet.get(story.bulletId);
    const plan = planByBullet.get(story.bulletId);
    if (!keywordPackage || !plan) {
      incoherentStoryIds.push(story.bulletId);
      continue;
    }
    if (!includesCaseInsensitive(story.action, keywordPackage.actionVerb)) {
      actionVerbErrors.push(story.bulletId);
    }
    if (
      keywordPackage.directKeywords.length > 0 &&
      !keywordPackage.directKeywords.some((keyword) =>
        includesCaseInsensitive(`${story.task} ${story.action}`, keyword),
      )
    ) {
      missingDirectKeywordUsages.push(story.bulletId);
    }
    for (const keyword of keywordPackage.supportingKeywords) {
      if (!includesCaseInsensitive(story.action, keyword)) {
        missingSupportingKeywordUsages.push(`${story.bulletId}:${keyword}`);
      }
    }
    for (const keyword of keywordPackage.outcomeKeywords) {
      if (
        !includesCaseInsensitive(story.result, keyword) &&
        !story.metrics.some((metric) => includesCaseInsensitive(metric.outcomeKeyword, keyword))
      ) {
        missingOutcomeKeywordUsages.push(`${story.bulletId}:${keyword}`);
      }
    }
    if (story.status !== "approved" || story.coherenceScore < 8) {
      incoherentStoryIds.push(story.bulletId);
    }
    for (const metric of story.metrics) {
      if (story.metricPlausibilityScore < 8) {
        implausibleMetricIds.push(metric.metricId);
      }
      const key = `${metric.metricType}:${metric.direction}:${metric.unit}:${metric.measure.toLowerCase()}`;
      const roleSet = metricPatternsByRole.get(story.experienceId) ?? new Set<string>();
      if (roleSet.has(key)) {
        repeatedMetricPatterns.push(`${story.experienceId}:${key}`);
      }
      roleSet.add(key);
      metricPatternsByRole.set(story.experienceId, roleSet);
    }
    const text = `${story.situation} ${story.task} ${story.action} ${story.result}`;
    if (plan.communicationFocused && !/stakeholder|cross-functional|product|business|alignment/i.test(text)) {
      communicationStoryErrors.push(story.bulletId);
    }
    if (plan.leadershipFocused && !/direction|strategy|design review|leadership|coordinat|owned/i.test(text)) {
      leadershipStoryErrors.push(story.bulletId);
    }
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  if (missingPlanBulletIds.length > 0) errors.push("One or more bullet plans do not have STAR stories.");
  if (duplicateStoryIds.length > 0) errors.push("STAR story IDs are duplicated.");
  if (unknownRequirementIds.length > 0) errors.push("STAR stories reference unknown JD requirements.");
  if (actionVerbErrors.length > 0) errors.push("One or more actions do not use their allocated action verb.");
  if (missingDirectKeywordUsages.length > 0) errors.push("One or more actions omit direct JD keywords.");
  if (missingSupportingKeywordUsages.length > 0) errors.push("One or more actions omit supporting keywords.");
  if (missingOutcomeKeywordUsages.length > 0) errors.push("One or more results omit allocated outcomes.");
  if (incoherentStoryIds.length > 0) errors.push("One or more STAR stories are incoherent or weak.");
  if (implausibleMetricIds.length > 0) errors.push("One or more metrics are implausible.");
  if (repeatedMetricPatterns.length > 0) warnings.push("Some metric patterns repeat within a role; their measured outcomes remain distinct.");
  if (communicationStoryErrors.length > 0) errors.push("Communication coverage is weak.");
  if (leadershipStoryErrors.length > 0) errors.push("Leadership coverage is weak.");

  const validation: StarGenerationValidation = {
    allPlansCovered: missingPlanBulletIds.length === 0,
    storyCountMatchesPlanCount: input.stories.length === input.plans.length,
    allStoryIdsUnique: duplicateStoryIds.length === 0,
    allRequirementReferencesValid: unknownRequirementIds.length === 0,
    allActionsUseAllocatedVerbs: actionVerbErrors.length === 0,
    allDirectKeywordsUsed: missingDirectKeywordUsages.length === 0,
    allSupportingKeywordsUsed: missingSupportingKeywordUsages.length === 0,
    allOutcomesUsed: missingOutcomeKeywordUsages.length === 0,
    allStoriesCoherent: incoherentStoryIds.length === 0,
    allMetricsPlausible: implausibleMetricIds.length === 0,
    metricPatternsDistinctWithinRoles: repeatedMetricPatterns.length === 0,
    communicationStoriesRelevant: communicationStoryErrors.length === 0,
    leadershipStoriesRelevant: leadershipStoryErrors.length === 0,
    duplicateStoryIds,
    missingPlanBulletIds,
    unknownRequirementIds: [...new Set(unknownRequirementIds)],
    actionVerbErrors,
    missingDirectKeywordUsages,
    missingSupportingKeywordUsages,
    missingOutcomeKeywordUsages,
    incoherentStoryIds: [...new Set(incoherentStoryIds)],
    implausibleMetricIds: [...new Set(implausibleMetricIds)],
    repeatedMetricPatterns: [...new Set(repeatedMetricPatterns)],
    communicationStoryErrors,
    leadershipStoryErrors,
    warnings,
    errors,
    overallStatus: errors.length === 0 ? "approved" : "rejected",
  };
  return validation;
}
