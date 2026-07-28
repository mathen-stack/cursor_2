"use client";

import { useMemo, type ChangeEvent } from "react";

const MONTHS = [
  { value: "01", label: "Jan" },
  { value: "02", label: "Feb" },
  { value: "03", label: "Mar" },
  { value: "04", label: "Apr" },
  { value: "05", label: "May" },
  { value: "06", label: "Jun" },
  { value: "07", label: "Jul" },
  { value: "08", label: "Aug" },
  { value: "09", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
] as const;

function parseMonthValue(value: string): { year: string; month: string } | null {
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed)) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  return { year: match[1], month: match[2] };
}

function buildYears(centerYear: number): string[] {
  const years: string[] = [];
  for (let year = centerYear + 1; year >= centerYear - 60; year -= 1) {
    years.push(String(year));
  }
  return years;
}

type MonthYearFieldsProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowPresent?: boolean;
  years: readonly string[];
};

function MonthYearFields({
  label,
  value,
  onChange,
  allowPresent = false,
  years,
}: MonthYearFieldsProps) {
  const isPresent = /^present$/i.test(value.trim());
  const parsed = parseMonthValue(value);
  const month = parsed?.month ?? "";
  const year = parsed?.year ?? "";

  function emit(nextMonth: string, nextYear: string) {
    if (!nextMonth || !nextYear) {
      onChange("");
      return;
    }
    onChange(`${nextYear}-${nextMonth}`);
  }

  return (
    <div className="period-part">
      <span className="period-part-label">{label}</span>
      <div className="period-part-controls">
        <select
          className="period-select"
          aria-label={`${label} month`}
          value={isPresent ? "" : month}
          disabled={isPresent}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            emit(event.target.value, year || String(new Date().getFullYear()))
          }
        >
          <option value="">Month</option>
          {MONTHS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          className="period-select"
          aria-label={`${label} year`}
          value={isPresent ? "" : year}
          disabled={isPresent}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            emit(month || "01", event.target.value)
          }
        >
          <option value="">Year</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        {allowPresent ? (
          <button
            type="button"
            className={`period-present-chip${isPresent ? " is-active" : ""}`}
            aria-pressed={isPresent}
            onClick={() => onChange(isPresent ? "" : "Present")}
          >
            Present
          </button>
        ) : null}
      </div>
    </div>
  );
}

type PeriodDateControlProps = {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  allowPresentEnd?: boolean;
};

export function PeriodDateControl({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  allowPresentEnd = false,
}: PeriodDateControlProps) {
  const years = useMemo(() => buildYears(new Date().getFullYear()), []);

  return (
    <div className="period-date-control">
      <MonthYearFields
        label="Start"
        value={startValue}
        onChange={onStartChange}
        years={years}
      />
      <span className="period-separator" aria-hidden>
        -
      </span>
      <MonthYearFields
        label="End"
        value={endValue}
        onChange={onEndChange}
        allowPresent={allowPresentEnd}
        years={years}
      />
    </div>
  );
}
