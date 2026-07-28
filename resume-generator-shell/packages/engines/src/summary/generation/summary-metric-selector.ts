import { deterministicNumber } from "../../experience/star/star-utils";

/**
 * Summary-only measure pool. Intentionally disjoint from Experience STAR
 * taxonomy labels so Professional Summary metrics are not cloned into bullets.
 */
const SUMMARY_ONLY_METRIC_PROFILES = [
  {
    measure: "release predictability",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 18,
    maximum: 34,
  },
  {
    measure: "production change success rate",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 14,
    maximum: 29,
  },
  {
    measure: "engineering delivery cadence",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 16,
    maximum: 31,
  },
  {
    measure: "roadmap completion rate",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 15,
    maximum: 28,
  },
  {
    measure: "platform operability score",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 12,
    maximum: 26,
  },
  {
    measure: "incident recovery confidence",
    direction: "increase" as const,
    unit: "%" as const,
    minimum: 17,
    maximum: 33,
  },
] as const;

export interface SummaryMetricClaim {
  measure: string;
  value: number;
  unit: "%";
  direction: "increase";
  /** Short clause usable inside a summary sentence (without trailing period). */
  clause: string;
}

function clauseFor(metric: {
  measure: string;
  value: number;
  unit: "%";
  direction: "increase";
}): string {
  return `a ${metric.value}${metric.unit} improvement in ${metric.measure}`;
}

export function selectSummaryMetrics(input: {
  seed: string;
  count?: number;
}): SummaryMetricClaim[] {
  const count = Math.max(2, input.count ?? 2);
  const start =
    Math.abs(
      [...input.seed].reduce((hash, char) => hash + char.charCodeAt(0), 0),
    ) % SUMMARY_ONLY_METRIC_PROFILES.length;

  const selected: SummaryMetricClaim[] = [];
  for (let offset = 0; offset < SUMMARY_ONLY_METRIC_PROFILES.length && selected.length < count; offset += 1) {
    const profile =
      SUMMARY_ONLY_METRIC_PROFILES[
        (start + offset) % SUMMARY_ONLY_METRIC_PROFILES.length
      ]!;
    if (selected.some((item) => item.measure === profile.measure)) {
      continue;
    }
    const value = deterministicNumber(
      `${input.seed}:${profile.measure}`,
      profile.minimum,
      profile.maximum,
      0,
    );
    const metric = {
      measure: profile.measure,
      value,
      unit: profile.unit,
      direction: profile.direction,
    };
    selected.push({
      ...metric,
      clause: clauseFor(metric),
    });
  }
  return selected;
}

export function formatSummaryMetricSentence(
  metrics: readonly SummaryMetricClaim[],
): string {
  if (metrics.length < 2) {
    throw new Error("Professional Summary requires at least two unique metrics.");
  }
  const [first, second, ...rest] = metrics;
  const extra =
    rest.length > 0
      ? `, and ${rest.map((metric) => metric.clause).join(", and ")}`
      : "";
  return `Demonstrated measurable impact through ${first!.clause} and ${second!.clause}${extra}.`;
}

/** Achievement metrics (%, x) — excludes years-of-experience phrasing. */
export const SUMMARY_ACHIEVEMENT_METRIC_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:%|x)\b|\b\d+(?:\.\d+)?%/gi;

export function countSummaryAchievementMetrics(summary: string): number {
  // `%` is non-word, so a trailing `\b` after `%` never matches. Count both
  // percent and multiplier forms explicitly.
  const percent = [...summary.matchAll(/\b\d+(?:\.\d+)?\s?%/g)];
  const multiplier = [...summary.matchAll(/\b\d+(?:\.\d+)?x\b/gi)];
  return percent.length + multiplier.length;
}
