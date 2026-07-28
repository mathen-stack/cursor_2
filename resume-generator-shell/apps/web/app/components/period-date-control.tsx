"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parseMonthValue(value: string): { year: number; month: number } | null {
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed)) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatMonthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function displayMonthValue(value: string, presentLabel = "Present"): string {
  if (/^present$/i.test(value.trim())) return presentLabel;
  const parsed = parseMonthValue(value);
  if (!parsed) return "Select month";
  return `${MONTHS[parsed.month - 1]} ${parsed.year}`;
}

type MonthPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  allowPresent?: boolean;
};

function MonthPicker({
  label,
  value,
  onChange,
  disabled = false,
  allowPresent = false,
}: MonthPickerProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isPresent = /^present$/i.test(value.trim());
  const parsed = parseMonthValue(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    () => parsed?.year ?? new Date().getFullYear(),
  );

  useEffect(() => {
    if (!open) return;
    setViewYear(parsed?.year ?? new Date().getFullYear());
  }, [open, parsed?.year]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedKey = useMemo(() => {
    if (!parsed) return "";
    return formatMonthValue(parsed.year, parsed.month);
  }, [parsed]);

  return (
    <div className={`month-picker${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`month-picker-trigger${open ? " is-open" : ""}${
          parsed || isPresent ? " has-value" : ""
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="month-picker-label">{label}</span>
        <strong className="month-picker-value">
          {displayMonthValue(value)}
        </strong>
      </button>

      {open ? (
        <div className="month-picker-panel" id={panelId} role="dialog" aria-label={label}>
          <div className="month-picker-toolbar">
            <button
              type="button"
              className="month-picker-nav"
              aria-label="Previous year"
              onClick={() => setViewYear((year) => year - 1)}
            >
              ‹
            </button>
            <p className="month-picker-year">{viewYear}</p>
            <button
              type="button"
              className="month-picker-nav"
              aria-label="Next year"
              onClick={() => setViewYear((year) => year + 1)}
            >
              ›
            </button>
          </div>

          <div className="month-picker-grid" role="listbox" aria-label="Months">
            {MONTHS.map((month, index) => {
              const monthNumber = index + 1;
              const key = formatMonthValue(viewYear, monthNumber);
              const selected = selectedKey === key;
              return (
                <button
                  key={month}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`month-picker-cell${selected ? " is-selected" : ""}`}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {month}
                </button>
              );
            })}
          </div>

          {allowPresent ? (
            <button
              type="button"
              className={`month-picker-present${isPresent ? " is-active" : ""}`}
              onClick={() => {
                onChange("Present");
                setOpen(false);
              }}
            >
              Present / Current
            </button>
          ) : null}
        </div>
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
  startLabel?: string;
  endLabel?: string;
};

export function PeriodDateControl({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  allowPresentEnd = false,
  startLabel = "Start",
  endLabel = "End",
}: PeriodDateControlProps) {
  return (
    <div className="period-date-control">
      <MonthPicker label={startLabel} value={startValue} onChange={onStartChange} />
      <span className="period-separator" aria-hidden>
        -
      </span>
      <MonthPicker
        label={endLabel}
        value={endValue}
        onChange={onEndChange}
        allowPresent={allowPresentEnd}
      />
    </div>
  );
}
