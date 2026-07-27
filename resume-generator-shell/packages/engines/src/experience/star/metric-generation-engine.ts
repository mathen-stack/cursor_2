import type { JobDescription } from "@resume/contracts";
import type { BulletPlanItem } from "../types/bullet-plan";
import type { KeywordPackage } from "../types/keyword-package";
import type { JDRequirement } from "../types/requirement";
import type { RoleAssignment } from "../types/role-assignment";
import type { StarMetric } from "../types/star-story";
import { STAR_DIMENSION_PROFILES } from "./star-taxonomy";
import { deterministicNumber } from "./star-utils";

function metricDisplay(metric: Omit<StarMetric, "displayText">): string {
  if (metric.metricType === "availability") {
    return `maintained ${metric.value}${metric.unit} ${metric.measure}`;
  }
  const verb = metric.direction === "increase" ? "increased" : "reduced";
  return `${verb} ${metric.measure} by ${metric.value}${metric.unit}`;
}

function directionForMeasure(
  measure: string,
  fallback: StarMetric["direction"],
): StarMetric["direction"] {
  if (
    /\b(error|defect|cost|latency|time|risk|failure|toil|effort|onboarding|rework)\b/i.test(
      measure,
    )
  ) {
    return "decrease";
  }
  if (
    /\b(accuracy|quality|velocity|throughput|reliability|availability|adoption|productivity|coverage|alignment|predictability|consistency|efficiency|scale|frequency|interoperability|extensibility|maintainability|satisfaction|confidence)\b/i.test(
      measure,
    )
  ) {
    return "increase";
  }
  return fallback === "maintain" ? "maintain" : fallback;
}

function measureKey(measure: string): string {
  return `measure:${measure.trim().toLocaleLowerCase()}`;
}

function isMeasureAvailable(
  measure: string,
  usedMetricPatternKeys: ReadonlySet<string>,
): boolean {
  const key = measureKey(measure);
  if (!measure.trim() || usedMetricPatternKeys.has(key)) {
    return false;
  }
  // Also block near-duplicates such as "throughput" vs "request throughput".
  const needle = measure.trim().toLocaleLowerCase();
  for (const used of usedMetricPatternKeys) {
    if (!used.startsWith("measure:")) continue;
    const existing = used.slice("measure:".length);
    if (
      existing === needle ||
      existing.includes(needle) ||
      needle.includes(existing)
    ) {
      return false;
    }
  }
  return true;
}

export class MetricGenerationEngine {
  generate(input: {
    jobDescription: JobDescription;
    plan: BulletPlanItem;
    keywordPackage: KeywordPackage;
    requirement: JDRequirement;
    assignment: RoleAssignment;
    usedMetricPatternKeys: ReadonlySet<string>;
  }): StarMetric[] {
    void input.jobDescription;
    void input.requirement;
    const profile = STAR_DIMENSION_PROFILES[input.plan.achievementDimension];
    const outcome =
      input.keywordPackage.outcomeKeywords[0] ??
      profile.metricProfiles[0]?.label ??
      "delivery outcomes";

    const selectedProfile =
      profile.metricProfiles.find((candidate) =>
        isMeasureAvailable(candidate.label, input.usedMetricPatternKeys),
      ) ??
      profile.metricProfiles.find((candidate) =>
        isMeasureAvailable(outcome, input.usedMetricPatternKeys),
      ) ??
      profile.metricProfiles[0];

    if (!selectedProfile) {
      throw new Error(`No metric profile is available for ${input.plan.bulletId}.`);
    }

    const stockMeasure = selectedProfile.label;
    let measure = stockMeasure;
    if (!isMeasureAvailable(stockMeasure, input.usedMetricPatternKeys)) {
      const fallbacks = [
        outcome,
        ...profile.metricProfiles.map((candidate) => candidate.label),
        ...Object.values(STAR_DIMENSION_PROFILES).flatMap((entry) =>
          entry.metricProfiles.map((candidate) => candidate.label),
        ),
        `${input.plan.achievementTheme} outcomes`,
        `${input.plan.roleFocusArea || "delivery"} results`,
      ];
      measure =
        fallbacks.find((candidate) =>
          isMeasureAvailable(candidate, input.usedMetricPatternKeys),
        ) ?? `${input.plan.bulletId.toLowerCase()} delivery outcome`;
    }

    const direction =
      measure === stockMeasure
        ? selectedProfile.direction
        : directionForMeasure(measure, selectedProfile.direction);

    const decimals =
      selectedProfile.metricType === "availability"
        ? 2
        : selectedProfile.unit === "x"
          ? 1
          : 0;
    let value = deterministicNumber(
      `${input.jobDescription.contentHash}:${input.assignment.experienceId}:${input.plan.bulletId}:${measure}`,
      selectedProfile.minimum,
      selectedProfile.maximum,
      decimals,
    );
    if (selectedProfile.metricType === "availability") {
      value = Math.round(value * 100) / 100;
    }

    const base: Omit<StarMetric, "displayText"> = {
      metricId: `${input.plan.bulletId}-M-001`,
      metricType: selectedProfile.metricType,
      direction,
      value,
      unit: selectedProfile.unit,
      measure,
      outcomeKeyword: outcome,
      rationale: `Uses a bounded ${selectedProfile.metricType} metric aligned with the ${input.plan.achievementDimension} achievement and allocated outcome "${outcome}".`,
      provenance: "generated-hypothetical",
    };

    return [
      {
        ...base,
        displayText: metricDisplay(base),
      },
    ];
  }
}
