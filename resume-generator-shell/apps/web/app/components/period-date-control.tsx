"use client";

import type { ChangeEvent } from "react";

type PeriodDateControlProps = {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  allowPresentEnd?: boolean;
  startPlaceholder?: string;
  endPlaceholder?: string;
};

export function PeriodDateControl({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  allowPresentEnd = false,
  startPlaceholder = "2022-01",
  endPlaceholder = allowPresentEnd ? "Present" : "2024-12",
}: PeriodDateControlProps) {
  return (
    <div className="period-date-control">
      <input
        className="period-text-input"
        type="text"
        aria-label="Start date"
        placeholder={startPlaceholder}
        value={startValue}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onStartChange(event.target.value)
        }
      />
      <span className="period-separator" aria-hidden>
        -
      </span>
      <input
        className="period-text-input"
        type="text"
        aria-label="End date"
        placeholder={endPlaceholder}
        value={endValue}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onEndChange(event.target.value)
        }
      />
    </div>
  );
}
