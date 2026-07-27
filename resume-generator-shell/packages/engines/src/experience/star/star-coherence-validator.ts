import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { StarMetric, StarStory } from "../types/star-story";
import { includesCaseInsensitive } from "./star-utils";

export interface StoryCoherenceResult {
  coherenceScore: number;
  metricPlausibilityScore: number;
  errors: string[];
  warnings: string[];
  status: "approved" | "rejected";
}

function metricPlausible(metric: StarMetric): boolean {
  if (!Number.isFinite(metric.value) || metric.value <= 0) {
    return false;
  }
  if (metric.metricType === "availability") {
    return metric.unit === "%" && metric.value >= 90 && metric.value <= 100;
  }
  if (metric.unit === "%") {
    return metric.value >= 1 && metric.value <= 100;
  }
  if (metric.unit === "x") {
    return metric.value >= 1.1 && metric.value <= 10;
  }
  if (metric.unit === "ms") {
    return metric.value >= 1 && metric.value <= 10_000;
  }
  return metric.value >= 1 && metric.value <= 365;
}

export class StarCoherenceValidator {
  validate(input: {
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    story: Omit<StarStory, "coherenceScore" | "metricPlausibilityScore" | "status">;
  }): StoryCoherenceResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { plan, keywordPackage, story } = input;

    if (!includesCaseInsensitive(story.action, keywordPackage.actionVerb)) {
      errors.push("Action does not use the allocated action verb.");
    }
    if (
      keywordPackage.directKeywords.length > 0 &&
      !keywordPackage.directKeywords.some((keyword) =>
        includesCaseInsensitive(`${story.task} ${story.action}`, keyword),
      )
    ) {
      errors.push("STAR story does not use any allocated direct JD keyword.");
    }
    for (const keyword of keywordPackage.supportingKeywords) {
      if (!includesCaseInsensitive(story.action, keyword)) {
        errors.push(`Action is missing supporting keyword "${keyword}".`);
      }
    }
    for (const keyword of keywordPackage.outcomeKeywords) {
      const resultUsesOutcome = includesCaseInsensitive(story.result, keyword);
      const metricUsesOutcome = story.metrics.some((metric) =>
        includesCaseInsensitive(metric.outcomeKeyword, keyword),
      );
      if (!resultUsesOutcome && !metricUsesOutcome) {
        errors.push(`Result is missing outcome keyword "${keyword}".`);
      }
    }

    if (!/limited|constrained|delayed|risk|bottleneck|inconsistent|manual|weak|misaligned|growth|difficult/i.test(story.situation)) {
      warnings.push("Situation has a weak problem signal.");
    }
    if (!/owned|responsibility|responsible|direction|align/i.test(story.task)) {
      warnings.push("Task has a weak ownership signal.");
    }
    if (story.metrics.length === 0) {
      errors.push("Result has no measurable metric.");
    }

    const implausible = story.metrics.filter((metric) => !metricPlausible(metric));
    if (implausible.length > 0) {
      errors.push(`Implausible metrics: ${implausible.map((metric) => metric.metricId).join(", ")}.`);
    }

    const peopleText = `${story.situation} ${story.task} ${story.action} ${story.result}`;
    if (
      plan.communicationFocused &&
      !/stakeholder|cross-functional|product|business|alignment|requirements/i.test(peopleText)
    ) {
      errors.push("Communication-focused story lacks stakeholder or cross-functional evidence.");
    }
    if (
      plan.leadershipFocused &&
      !/technical direction|strategy|design review|leadership|coordinating|owned/i.test(peopleText)
    ) {
      errors.push("Leadership-focused story lacks leadership evidence.");
    }

    const coherenceScore = Math.max(
      0,
      Math.min(10, 10 - errors.length * 1.75 - warnings.length * 0.35),
    );
    const metricPlausibilityScore = implausible.length === 0 && story.metrics.length > 0 ? 9.2 : 4;
    return {
      coherenceScore: Math.round(coherenceScore * 10) / 10,
      metricPlausibilityScore,
      errors,
      warnings,
      status: errors.length === 0 && coherenceScore >= 8 ? "approved" : "rejected",
    };
  }
}
