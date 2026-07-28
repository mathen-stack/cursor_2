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
    /\b(accuracy|quality|velocity|throughput|reliability|availability|adoption|productivity|coverage|alignment|predictability|consistency|efficiency|scale|frequency|interoperability|extensibility|maintainability|satisfaction|confidence|speed|pace)\b/i.test(
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

function valueKey(unit: string, value: number): string {
  return `value:${unit}:${value}`;
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

function isValueAvailable(
  unit: string,
  value: number,
  usedMetricPatternKeys: ReadonlySet<string>,
): boolean {
  return !usedMetricPatternKeys.has(valueKey(unit, value));
}

function pickUniqueValue(input: {
  seed: string;
  minimum: number;
  maximum: number;
  decimals: number;
  unit: string;
  usedMetricPatternKeys: ReadonlySet<string>;
}): number {
  const factor = 10 ** input.decimals;
  const step = 1 / factor;
  let value = deterministicNumber(
    input.seed,
    input.minimum,
    input.maximum,
    input.decimals,
  );
  if (isValueAvailable(input.unit, value, input.usedMetricPatternKeys)) {
    return value;
  }
  // Walk the allowed range so "38%" cannot be reused across bullets.
  const start = Math.round(value * factor);
  const min = Math.round(input.minimum * factor);
  const max = Math.round(input.maximum * factor);
  for (let offset = 1; offset <= max - min + 1; offset += 1) {
    for (const direction of [1, -1]) {
      const candidateRaw = start + direction * offset;
      if (candidateRaw < min || candidateRaw > max) continue;
      const candidate = candidateRaw / factor;
      if (isValueAvailable(input.unit, candidate, input.usedMetricPatternKeys)) {
        return candidate;
      }
    }
  }
  // Range exhausted (common for tight availability bands like 99.90-99.99).
  // Expand outward while keeping values resume-plausible; never return a duplicate.
  for (let offset = 1; offset <= 500; offset += 1) {
    for (const direction of [1, -1]) {
      const candidate = (start + direction * offset) / factor;
      if (candidate <= 0) continue;
      if (input.unit === "%" && candidate >= 100) continue;
      if (isValueAvailable(input.unit, candidate, input.usedMetricPatternKeys)) {
        return candidate;
      }
    }
  }
  // Deterministic last-resort unique stamp from the seed.
  void step;
  let fallback = Math.max(step, Number((value + step).toFixed(input.decimals)));
  while (
    !isValueAvailable(input.unit, fallback, input.usedMetricPatternKeys) ||
    (input.unit === "%" && fallback >= 100)
  ) {
    fallback = Number((fallback + step).toFixed(input.decimals));
    if (fallback > 1_000_000) {
      break;
    }
  }
  return fallback;
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
    const outcomeConflicts = (candidate: string): boolean => {
      const outcomeLower = outcome.toLocaleLowerCase();
      const candidateLower = candidate.toLocaleLowerCase();
      if (
        outcomeLower === candidateLower ||
        outcomeLower.includes(candidateLower) ||
        candidateLower.includes(outcomeLower)
      ) {
        return true;
      }
      const primaryNouns = [
        "velocity",
        "throughput",
        "adoption",
        "latency",
        "reliability",
        "availability",
        "predictability",
      ];
      const outcomeTokens = new Set(
        outcomeLower.split(/[^a-z0-9]+/).filter((token) => token.length > 2),
      );
      const candidateTokens = candidateLower
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2);
      return primaryNouns.some(
        (noun) => outcomeTokens.has(noun) && candidateTokens.includes(noun),
      );
    };
    if (
      !isMeasureAvailable(stockMeasure, input.usedMetricPatternKeys) ||
      outcomeConflicts(stockMeasure)
    ) {
      const fallbacks = [
        ...profile.metricProfiles.map((candidate) => candidate.label),
        ...Object.values(STAR_DIMENSION_PROFILES).flatMap((entry) =>
          entry.metricProfiles.map((candidate) => candidate.label),
        ),
        `${input.plan.achievementTheme} outcomes`,
        `${input.plan.roleFocusArea || "delivery"} results`,
        outcome,
      ];
      measure =
        fallbacks.find(
          (candidate) =>
            isMeasureAvailable(candidate, input.usedMetricPatternKeys) &&
            !outcomeConflicts(candidate),
        ) ??
        fallbacks.find((candidate) =>
          isMeasureAvailable(candidate, input.usedMetricPatternKeys),
        ) ??
        `${input.plan.bulletId.toLowerCase()} delivery outcome`;
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
    let value = pickUniqueValue({
      seed: `${input.jobDescription.contentHash}:${input.assignment.experienceId}:${input.plan.bulletId}:${measure}`,
      minimum: selectedProfile.minimum,
      maximum: selectedProfile.maximum,
      decimals,
      unit: selectedProfile.unit,
      usedMetricPatternKeys: input.usedMetricPatternKeys,
    });
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
