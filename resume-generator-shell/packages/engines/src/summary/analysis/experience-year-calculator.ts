import type {
  CareerEntry,
  GenerationContext,
  JobDescription,
  SummaryExperienceYears,
  SummarySeniority,
} from "@resume/contracts";
import type { ExperienceYearAnalysisOutput } from "../types/analysis";

interface MonthInterval {
  start: number;
  end: number;
}

function referenceMonth(referenceDate: Date): number {
  return referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
}

function parseMonth(value: string, presentMonth: number): number {
  const normalized = value.trim().toLowerCase();
  if (["present", "current", "now", "ongoing"].includes(normalized)) {
    return presentMonth;
  }

  const yearMonth = /^(\d{4})-(0?[1-9]|1[0-2])$/.exec(normalized);
  if (yearMonth) return Number(yearMonth[1]) * 12 + Number(yearMonth[2]) - 1;

  const yearOnly = /^(\d{4})$/.exec(normalized);
  if (yearOnly) return Number(yearOnly[1]) * 12;

  const monthYear = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/i.exec(value.trim());
  if (monthYear) {
    const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = names.indexOf(monthYear[1]!.slice(0, 3).toLowerCase());
    return Number(monthYear[2]) * 12 + month;
  }

  throw new Error(
    `Unsupported career date "${value}". Use YYYY, YYYY-MM, a month and year, or Present.`,
  );
}

function calculateCareerMonths(
  careerHistory: readonly CareerEntry[],
  referenceDate: Date,
): number | null {
  try {
    const present = referenceMonth(referenceDate);
    const intervals: MonthInterval[] = careerHistory.map((entry) => {
      const start = parseMonth(entry.startDate, present);
      const end = parseMonth(entry.endDate, present);
      if (start > end) throw new Error("Career start date is after end date.");
      return { start, end };
    }).sort((left, right) => left.start - right.start);

    if (intervals.length === 0) return null;
    let total = 0;
    let currentStart = intervals[0]!.start;
    let currentEnd = intervals[0]!.end;
    for (const interval of intervals.slice(1)) {
      if (interval.start <= currentEnd + 1) {
        currentEnd = Math.max(currentEnd, interval.end);
      } else {
        total += currentEnd - currentStart + 1;
        currentStart = interval.start;
        currentEnd = interval.end;
      }
    }
    return total + currentEnd - currentStart + 1;
  } catch {
    return null;
  }
}

function extractRequiredYears(text: string): number | null {
  const values: number[] = [];
  const rangePattern = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)\b/gi;
  for (const match of text.matchAll(rangePattern)) {
    const minimum = Number(match[1]);
    if (Number.isFinite(minimum)) values.push(minimum);
  }

  const withoutRanges = text.replace(rangePattern, " ");
  for (const match of withoutRanges.matchAll(/\b(?:at least\s+|minimum(?: of)?\s+)?(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values.length > 0 ? Math.max(...values) : null;
}

function seniorityFallback(seniority: SummarySeniority): number {
  const values: Record<SummarySeniority, number> = {
    entry: 1,
    junior: 2,
    mid: 3,
    senior: 5,
    lead: 7,
    staff: 8,
    principal: 10,
    manager: 8,
  };
  return values[seniority] ?? 3;
}

export interface ExperienceYearCalculatorOptions {
  referenceDate?: Date;
}

export class ExperienceYearCalculator {
  readonly name = "summary-experience-year-calculator";
  private readonly referenceDate: Date;

  constructor(options: ExperienceYearCalculatorOptions = {}) {
    this.referenceDate = options.referenceDate ?? new Date();
  }

  execute(input: {
    context: GenerationContext;
    jobDescription: JobDescription;
    careerHistory: readonly CareerEntry[];
    seniority: SummarySeniority;
  }): ExperienceYearAnalysisOutput {
    const jdRequiredYears = extractRequiredYears(input.jobDescription.rawText);
    const careerMonths = calculateCareerMonths(input.careerHistory, this.referenceDate);
    const calculatedCareerYears = careerMonths === null
      ? null
      : Math.max(1, Math.floor(careerMonths / 12));

    let value: number;
    let source: SummaryExperienceYears["source"];
    if (jdRequiredYears !== null) {
      value = jdRequiredYears;
      source = "explicit-jd";
    } else if (calculatedCareerYears !== null) {
      value = calculatedCareerYears;
      source = "career-timeline";
    } else {
      value = seniorityFallback(input.seniority);
      source = "seniority-inference";
    }

    return {
      context: input.context,
      experienceYears: {
        value,
        display: `${value}+ years`,
        source,
        jdRequiredYears,
        calculatedCareerYears,
      },
    };
  }
}
