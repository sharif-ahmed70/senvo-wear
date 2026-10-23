"use client";

import { useState } from "react";
import styles from "./dashboard.module.css";

export type DashboardRangePreset =
  "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

export type DashboardRangeValue = {
  from: string;
  preset: DashboardRangePreset;
  to: string;
};

const presets: Array<[DashboardRangePreset, string]> = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last7", "Last 7 days"],
  ["thisMonth", "This month"],
  ["lastMonth", "Last month"],
  ["custom", "Custom"],
];

/** Today's date in Dhaka as YYYY-MM-DD (the dashboard's business day). */
export function dhakaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Dhaka",
    year: "numeric",
  }).format(now);
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The from/to dates a preset stands for, counted from `today`. */
export function presetRange(
  preset: Exclude<DashboardRangePreset, "custom">,
  today: string,
): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: shift(today, -1), to: shift(today, -1) };
    case "last7":
      return { from: shift(today, -6), to: today };
    case "thisMonth":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastMonthEnd = shift(monthStart, -1);
      return { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd };
    }
  }
}

export function DashboardRange({
  busy,
  onChange,
  value,
}: {
  busy: boolean;
  onChange: (value: DashboardRangeValue) => void;
  value: DashboardRangeValue;
}) {
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [custom, setCustom] = useState(value.preset === "custom");
  const [error, setError] = useState("");

  function choose(preset: DashboardRangePreset) {
    setError("");
    if (preset === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    const range = presetRange(preset, dhakaToday());
    setFrom(range.from);
    setTo(range.to);
    onChange({ ...range, preset });
  }

  function applyCustom() {
    if (!from || !to) return setError("Choose both dates.");
    if (from > to) return setError("The start date must be before the end.");
    setError("");
    onChange({ from, preset: "custom", to });
  }

  return (
    <div aria-label="Dashboard period" className={styles.rangeBar} role="group">
      {presets.map(([preset, label]) => (
        <button
          aria-pressed={
            preset === "custom" ? custom : !custom && value.preset === preset
          }
          disabled={busy}
          key={preset}
          onClick={() => choose(preset)}
          type="button"
        >
          {label}
        </button>
      ))}
      {custom ? (
        <>
          <label>
            From
            <input
              disabled={busy}
              max={dhakaToday()}
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
          </label>
          <label>
            To
            <input
              disabled={busy}
              max={dhakaToday()}
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </label>
          <button disabled={busy} onClick={applyCustom} type="button">
            Apply
          </button>
        </>
      ) : null}
      {error ? (
        <p className={styles.rangeError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
