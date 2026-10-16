"use client";

import { useMemo } from "react";
import { formatBdt } from "../../sell/_lib/money";

export const BDT_DENOMINATIONS = [
  { label: "৳1,000", value: 1000 },
  { label: "৳500", value: 500 },
  { label: "৳200", value: 200 },
  { label: "৳100", value: 100 },
  { label: "৳50", value: 50 },
  { label: "৳20", value: 20 },
  { label: "৳10", value: 10 },
  { label: "৳5", value: 5 },
  { label: "৳2", value: 2 },
  { label: "৳1", value: 1 },
] as const;

export type DenominationCounts = Record<string, number>;

export function calculateDenominationTotalMinor(
  counts: DenominationCounts,
): number {
  return BDT_DENOMINATIONS.reduce((sum, denom) => {
    const count = counts[String(denom.value)] ?? 0;
    return sum + count * denom.value * 100;
  }, 0);
}

export function CashDenominationCounter({
  counts,
  onChange,
  onApply,
}: {
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
  onApply?: (totalMinor: number) => void;
}) {
  const totalMinor = useMemo(
    () => calculateDenominationTotalMinor(counts),
    [counts],
  );

  function handleCountChange(denomValue: number, rawValue: string) {
    const parsed = Number.parseInt(rawValue, 10);
    const sanitized = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    onChange({
      ...counts,
      [String(denomValue)]: sanitized,
    });
  }

  function handleReset() {
    const empty: DenominationCounts = {};
    for (const d of BDT_DENOMINATIONS) {
      empty[String(d.value)] = 0;
    }
    onChange(empty);
  }

  return (
    <div className="denomination-counter" data-testid="denomination-counter">
      <div className="denomination-header">
        <h4>Cash Drawer Denomination Count (নোট ও কয়েন গণনা)</h4>
        <button
          type="button"
          onClick={handleReset}
          className="denom-reset-button"
        >
          Reset All
        </button>
      </div>

      <div className="denomination-grid">
        {BDT_DENOMINATIONS.map((denom) => {
          const count = counts[String(denom.value)] ?? 0;
          const subtotalMinor = count * denom.value * 100;

          return (
            <div key={denom.value} className="denomination-row">
              <span className="denom-label">{denom.label}</span>
              <span className="denom-times">×</span>
              <input
                type="number"
                min="0"
                step="1"
                value={count === 0 ? "" : count}
                placeholder="0"
                onChange={(e) => handleCountChange(denom.value, e.target.value)}
                className="denom-input"
                aria-label={`Count for ${denom.label}`}
              />
              <span className="denom-subtotal">{formatBdt(subtotalMinor)}</span>
            </div>
          );
        })}
      </div>

      <div className="denomination-footer">
        <div className="denom-total-display">
          <span>Total Counted Cash:</span>
          <strong>{formatBdt(totalMinor)}</strong>
        </div>
        {onApply && (
          <button
            type="button"
            className="denom-apply-button"
            onClick={() => onApply(totalMinor)}
          >
            Apply to Cash Drawer
          </button>
        )}
      </div>
    </div>
  );
}
