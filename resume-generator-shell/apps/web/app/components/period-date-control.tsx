"use client";

import { useMemo } from "react";

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

function parseMonthValue(value: string): { year: number; month: string } | null {
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed)) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2];
  if (!Number.isFinite(year) || !MONTHS.some((item) => item.value === month)) {
    return null;
  }
  return { year, month };
}

function formatDisplay(value: string): string {
  if (/^present$/i.test(value.trim())) return "Present";
  const parsed = parseMonthValue(value);
  if (!parsed) return "Not set";
  const month = MONTHS.find((item) => item.value === parsed.month)?.label ?? parsed.month;
  return `${month} ${parsed.year}`;
}

type SidePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowPresent?: boolean;
  minYear: number;
  maxYear: number;
};

function SidePicker({
  label,
  value,
  onChange,
  allowPresent = false,
  minYear,
  maxYear,
}: SidePickerProps) {
  const isPresent = /^present$/i.test(value.trim());
  const parsed = parseMonthValue(value);
  const year = parsed?.year ?? new Date().getFullYear();
  const month = parsed?.month ?? "";

  function setYear(nextYear: number) {
    const clamped = Math.min(maxYear, Math.max(minYear, nextYear));
    onChange(`${clamped}-${month || "01"}`);
  }

  function setMonth(nextMonth: string) {
    onChange(`${year}-${nextMonth}`);
  }

  return (
    <div className={`period-side${isPresent ? " is-present" : ""}`}>
      <div className="period-side-head">
        <span className="period-side-label">{label}</span>
        <strong className="period-side-value">{formatDisplay(value)}</strong>
      </div>

      <div className="period-year-row">
        <button
          type="button"
          className="period-year-nav"
          aria-label={`Earlier ${label.toLowerCase()} year`}
          disabled={isPresent || year <= minYear}
          onClick={() => setYear(year - 1)}
        >
          ‹
        </button>
        <p className="period-year-display">{isPresent ? "——" : year}</p>
        <button
          type="button"
          className="period-year-nav"
          aria-label={`Later ${label.toLowerCase()} year`}
          disabled={isPresent || year >= maxYear}
          onClick={() => setYear(year + 1)}
        >
          ›
        </button>
      </div>

      <div className="period-month-grid" role="listbox" aria-label={`${label} month`}>
        {MONTHS.map((item) => {
          const selected = !isPresent && month === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={selected}
              className={`period-month-pill${selected ? " is-selected" : ""}`}
              disabled={isPresent}
              onClick={() => setMonth(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {allowPresent ? (
        <button
          type="button"
          className={`period-present-toggle${isPresent ? " is-active" : ""}`}
          aria-pressed={isPresent}
          onClick={() => onChange(isPresent ? `${year}-01` : "Present")}
        >
          {isPresent ? "Using Present" : "Set as Present"}
        </button>
      ) : null}
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
  const nowYear = useMemo(() => new Date().getFullYear(), []);
  const minYear = nowYear - 60;
  const maxYear = nowYear + 1;

  return (
    <div className="period-date-control">
      <SidePicker
        label="Start"
        value={startValue}
        onChange={onStartChange}
        minYear={minYear}
        maxYear={maxYear}
      />
      <div className="period-bridge" aria-hidden>
        <span className="period-bridge-line" />
        <span className="period-bridge-dot">-</span>
        <span className="period-bridge-line" />
      </div>
      <SidePicker
        label="End"
        value={endValue}
        onChange={onEndChange}
        allowPresent={allowPresentEnd}
        minYear={minYear}
        maxYear={maxYear}
      />
    </div>
  );
}
