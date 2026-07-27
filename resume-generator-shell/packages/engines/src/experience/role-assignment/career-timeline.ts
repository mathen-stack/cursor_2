import type { CareerEntry } from "@resume/contracts";

export interface ParsedCareerEntry {
  entry: CareerEntry;
  startMonth: number;
  endMonth: number;
  durationMonths: number;
  chronologyRank: number;
  isMostRecent: boolean;
}

function parseMonthValue(value: string, presentMonth: number): number {
  const normalized = value.trim().toLowerCase();
  if (["present", "current", "now", "ongoing"].includes(normalized)) {
    return presentMonth;
  }

  const yearMonth = /^(\d{4})-(0?[1-9]|1[0-2])$/.exec(normalized);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return year * 12 + (month - 1);
  }

  const yearOnly = /^(\d{4})$/.exec(normalized);
  if (yearOnly) {
    return Number(yearOnly[1]) * 12;
  }

  const monthYear = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i.exec(
    value.trim(),
  );
  if (monthYear) {
    const monthNames = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = monthNames.indexOf(monthYear[1]!.slice(0, 3).toLowerCase());
    return Number(monthYear[2]) * 12 + month;
  }

  throw new Error(
    `Unsupported career date "${value}". Use YYYY, YYYY-MM, a month and year, or Present.`,
  );
}

function getReferenceMonth(referenceDate: Date): number {
  return referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
}

export function buildCareerTimeline(
  careerHistory: readonly CareerEntry[],
  referenceDate: Date,
): ParsedCareerEntry[] {
  if (careerHistory.length === 0) {
    throw new Error("Automatic role assignment requires at least one career entry.");
  }

  const presentMonth = getReferenceMonth(referenceDate);
  const parsed = careerHistory.map((entry) => {
    const startMonth = parseMonthValue(entry.startDate, presentMonth);
    const endMonth = parseMonthValue(entry.endDate, presentMonth);

    if (startMonth > endMonth) {
      throw new Error(
        `Career entry ${entry.experienceId} starts after it ends.`,
      );
    }

    return {
      entry,
      startMonth,
      endMonth,
      durationMonths: endMonth - startMonth + 1,
    };
  });

  const sorted = [...parsed].sort((left, right) => {
    if (right.endMonth !== left.endMonth) {
      return right.endMonth - left.endMonth;
    }
    if (right.startMonth !== left.startMonth) {
      return right.startMonth - left.startMonth;
    }
    return left.entry.experienceId.localeCompare(right.entry.experienceId);
  });

  const rankById = new Map(
    sorted.map((item, index) => [item.entry.experienceId, index + 1]),
  );

  return parsed.map((item) => {
    const chronologyRank = rankById.get(item.entry.experienceId);
    if (chronologyRank === undefined) {
      throw new Error(`Unable to rank career entry ${item.entry.experienceId}.`);
    }

    return {
      ...item,
      chronologyRank,
      isMostRecent: chronologyRank === 1,
    };
  });
}

export function calculateNonOverlappingExperienceMonths(
  timeline: readonly ParsedCareerEntry[],
): number {
  const intervals = timeline
    .map((item) => ({ start: item.startMonth, end: item.endMonth }))
    .sort((left, right) => left.start - right.start);

  if (intervals.length === 0) {
    return 0;
  }

  let total = 0;
  let currentStart = intervals[0]!.start;
  let currentEnd = intervals[0]!.end;

  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }

    total += currentEnd - currentStart + 1;
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  return total + (currentEnd - currentStart + 1);
}
