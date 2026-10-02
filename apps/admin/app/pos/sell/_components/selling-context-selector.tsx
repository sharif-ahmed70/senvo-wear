import Link from "next/link";
import { useState } from "react";
import type {
  SalesCounterContract,
  SalesSessionContract,
} from "@senvo/contracts";
import { parseTaka } from "../_lib/money";

export type SellingContext = {
  counter: SalesCounterContract;
  session: SalesSessionContract;
};

export function SellingContextSelector({
  availableCounters = [],
  contexts,
  onOpenCounter,
  onSelect,
  openingCounter = false,
  selectedId,
}: {
  availableCounters?: readonly SalesCounterContract[];
  contexts: readonly SellingContext[];
  onOpenCounter?: (counterId: string, openingFloatMinor: number) => void;
  onSelect: (sessionId: string) => void;
  openingCounter?: boolean;
  selectedId: string;
}) {
  const [selectedCounterId, setSelectedCounterId] = useState("");
  const [openingFloat, setOpeningFloat] = useState("");
  const [floatError, setFloatError] = useState("");
  const activeCounterId = selectedCounterId || (availableCounters[0]?.id ?? "");

  function handleOpen() {
    if (!onOpenCounter) return;
    const floatStr = openingFloat.trim();
    let openingFloatMinor = 0;
    if (floatStr) {
      const parsed = parseTaka(floatStr);
      if (parsed === null || parsed < 0) {
        setFloatError("সঠিক টাকার পরিমাণ লিখুন");
        return;
      }
      openingFloatMinor = parsed;
    }
    setFloatError("");
    onOpenCounter(activeCounterId, openingFloatMinor);
  }

  if (contexts.length === 0) {
    if (onOpenCounter && availableCounters.length > 0) {
      return (
        <section className="pos-sale-state pos-sale-state--open-counter">
          <strong>No active sales session found</strong>
          <p>Open a counter session now to begin ringing up sales.</p>
          <div className="pos-open-counter-form">
            {availableCounters.length === 1 ? (
              <div className="pos-open-counter-single">
                <span>Sales counter:</span>
                <strong>{availableCounters[0]?.name}</strong>
                <small>{availableCounters[0]?.code}</small>
              </div>
            ) : (
              <label className="pos-sale-context-select">
                Select counter to open
                <select
                  disabled={openingCounter}
                  onChange={(event) => setSelectedCounterId(event.target.value)}
                  value={activeCounterId}
                >
                  {availableCounters.map((counter) => (
                    <option key={counter.id} value={counter.id}>
                      {counter.name} ({counter.code})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="pos-sale-context-select">
              Drawer-এ শুরুর টাকা (৳)
              <input
                type="text"
                inputMode="decimal"
                value={openingFloat}
                onChange={(e) => {
                  setOpeningFloat(e.target.value);
                  if (floatError) setFloatError("");
                }}
                disabled={openingCounter}
                placeholder="0.00"
              />
            </label>
            {floatError && <p className="pos-form-error" role="alert">{floatError}</p>}
            <button
              className="pos-complete-button"
              disabled={openingCounter || !activeCounterId}
              onClick={handleOpen}
              type="button"
            >
              {openingCounter
                ? "Opening counter..."
                : "Open Counter & Start Selling"}
            </button>
          </div>
          <Link className="pos-sale-secondary" href="/pos/sessions">
            Go to Sales Sessions
          </Link>
        </section>
      );
    }
    return (
      <section className="pos-sale-state">
        <strong>Start a sales session before recording a sale.</strong>
        <p>Choose an active sales counter on the Sales Sessions page.</p>
        <Link className="pos-sale-secondary" href="/pos/sessions">
          Go to Sales Sessions
        </Link>
      </section>
    );
  }
  if (contexts.length === 1) {
    return (
      <div className="pos-sale-context" aria-label="Selected sales counter">
        <span>Sales counter</span>
        <strong>{contexts[0]?.counter.name}</strong>
        <small>{contexts[0]?.counter.code}</small>
        <small>
          Opened by {contexts[0]?.session.openedByName ?? "Unknown"}
        </small>
      </div>
    );
  }
  return (
    <label className="pos-sale-context-select">
      Sales counter
      <select
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="">Choose a counter</option>
        {contexts.map(({ counter, session }) => (
          <option key={session.id} value={session.id}>
            {counter.name} ({counter.code}) / Opened by{" "}
            {session.openedByName ?? "Unknown"}
          </option>
        ))}
      </select>
    </label>
  );
}
