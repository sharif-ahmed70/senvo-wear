"use client";

import type {
  PosRegisterSettlementContract,
  PosSessionReconciliationSummaryContract,
} from "@senvo/contracts";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  CreditCard,
  DollarSign,
  LoaderCircle,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { formatBdt, parseTaka, takaInput } from "../../sell/_lib/money";
import {
  CashDenominationCounter,
  type DenominationCounts,
} from "./cash-denomination-counter";
import styles from "./register-settlement.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const QUICK_REASONS = [
  "Cash drawer counting error (ক্যাশ গণনায় ভুল)",
  "Customer change shortage / rounding (ভাংতি বা রাউন্ডিং)",
  "Gateway / mobile banking transaction fee (লেনদেন ফি কর্তন)",
  "Card pos slip discrepancy (কার্ড পস স্লিপ গরমিল)",
  "Pending payment verification (পেমেন্ট ভেরিফিকেশন বাকি)",
  "Other cashier discrepancy (অন্যান্য কারণ)",
];

export function RegisterSettlementModal({
  sessionId,
  sessionVersion,
  counterName,
  onClose,
  onSettled,
}: {
  sessionId: string;
  sessionVersion: number;
  counterName?: string;
  onClose: () => void;
  onSettled: (settlement: PosRegisterSettlementContract) => void;
}) {
  const [summary, setSummary] =
    useState<PosSessionReconciliationSummaryContract | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Actual input strings (in Taka, e.g. "1200.50")
  const [cashInput, setCashInput] = useState<string>("");
  const [mobileBankingInput, setMobileBankingInput] = useState<string>("");
  const [cardInput, setCardInput] = useState<string>("");
  const [bankTransferInput, setBankTransferInput] = useState<string>("");

  // Cash denomination breakdown
  const [showDenomCounter, setShowDenomCounter] = useState(false);
  const [denomCounts, setDenomCounts] = useState<DenominationCounts>({});

  // Notes and reasons
  const [discrepancyReason, setDiscrepancyReason] = useState<string>("");
  const [closingNotes, setClosingNotes] = useState<string>("");

  // Form submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingSummary(true);
    client
      .getSessionReconciliationSummary(sessionId)
      .then((res) => {
        if (!active) return;
        setSummary(res.data);
        // Pre-fill digital methods to expected since digital is usually 1:1 verified
        setCashInput(takaInput(res.data.expectedCashMinor));
        setMobileBankingInput(takaInput(res.data.expectedMobileBankingMinor));
        setCardInput(takaInput(res.data.expectedCardMinor));
        setBankTransferInput(takaInput(res.data.expectedBankTransferMinor));
      })
      .catch((err) => {
        if (!active) return;
        setSummaryError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load session reconciliation details.",
        );
      })
      .finally(() => {
        if (active) setLoadingSummary(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Minor unit amounts
  const actualCashMinor = useMemo(() => parseTaka(cashInput) ?? 0, [cashInput]);
  const actualMobileBankingMinor = useMemo(
    () => parseTaka(mobileBankingInput) ?? 0,
    [mobileBankingInput],
  );
  const actualCardMinor = useMemo(() => parseTaka(cardInput) ?? 0, [cardInput]);
  const actualBankTransferMinor = useMemo(
    () => parseTaka(bankTransferInput) ?? 0,
    [bankTransferInput],
  );

  const actualTotalMinor =
    actualCashMinor +
    actualMobileBankingMinor +
    actualCardMinor +
    actualBankTransferMinor;

  const expectedTotalMinor = summary?.expectedTotalMinor ?? 0;
  const totalDiscrepancyMinor = actualTotalMinor - expectedTotalMinor;

  const status =
    totalDiscrepancyMinor === 0
      ? "BALANCED"
      : totalDiscrepancyMinor > 0
        ? "OVERAGE"
        : "SHORTAGE";

  const hasDiscrepancy = totalDiscrepancyMinor !== 0;

  function handleApplyDenomination(totalMinor: number) {
    setCashInput(takaInput(totalMinor));
    setShowDenomCounter(false);
  }

  async function handleCloseRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;

    if (hasDiscrepancy && !discrepancyReason.trim()) {
      setSubmitError(
        "A reason is required when drawer counts do not match expected totals.",
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await client.closeSessionWithSettlement({
        actualBankTransferMinor,
        actualCardMinor,
        actualCashMinor,
        actualMobileBankingMinor,
        closingNotes: closingNotes.trim() || undefined,
        denominationBreakdown:
          Object.keys(denomCounts).length > 0 ? denomCounts : undefined,
        discrepancyReason: hasDiscrepancy
          ? discrepancyReason.trim()
          : undefined,
        expectedVersion: sessionVersion,
        sessionId,
      });

      onSettled(res.data);
    } catch (err) {
      setSubmitError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to settle drawer and close register.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>
              <Banknote size={22} />
              Register Closing & Day-End Settlement
            </h2>
            <p className={styles.headerSub}>
              {counterName ? `${counterName} • ` : ""}Session:{" "}
              {sessionId.slice(0, 8)}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </header>

        {loadingSummary ? (
          <div
            className={styles.body}
            style={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 300,
            }}
          >
            <LoaderCircle size={32} className="pos-spin" />
            <p>Auditing sales records and calculating expected totals...</p>
          </div>
        ) : summaryError || !summary ? (
          <div className={styles.body}>
            <div className={styles.errorMessage}>
              {summaryError ?? "Could not load reconciliation data."}
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void handleCloseRegister(e);
            }}
            className={styles.body}
          >
            {submitError && (
              <div className={styles.errorMessage}>{submitError}</div>
            )}

            {/* Expected Summary Audit */}
            <section className={styles.auditSection}>
              <h3>
                System Expected Totals (হিসাব অনুযায়ী প্রত্যাশিত ব্যালেন্স)
              </h3>
              <div className={styles.auditGrid}>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>
                    Opening Cash Float
                  </span>
                  <span className={styles.auditCardValue}>
                    {formatBdt(summary.openingFloatMinor)}
                  </span>
                </div>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>
                    Net Cash in Drawer
                  </span>
                  <span
                    className={styles.auditCardValue}
                    style={{ color: "#047857" }}
                  >
                    {formatBdt(summary.expectedCashMinor)}
                  </span>
                </div>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>Mobile Banking</span>
                  <span className={styles.auditCardValue}>
                    {formatBdt(summary.expectedMobileBankingMinor)}
                  </span>
                </div>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>Card / Bank</span>
                  <span className={styles.auditCardValue}>
                    {formatBdt(
                      summary.expectedCardMinor +
                        summary.expectedBankTransferMinor,
                    )}
                  </span>
                </div>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>
                    Total Sales Count
                  </span>
                  <span className={styles.auditCardValue}>
                    {summary.salesCount}
                  </span>
                </div>
                <div className={styles.auditCard}>
                  <span className={styles.auditCardLabel}>Total Expected</span>
                  <span
                    className={styles.auditCardValue}
                    style={{ color: "#1d4ed8" }}
                  >
                    {formatBdt(summary.expectedTotalMinor)}
                  </span>
                </div>
              </div>
            </section>

            <section className={styles.countSection}>
              <h3>Sales by team member</h3>
              {summary.sellerTotals.map((seller) => (
                <p key={seller.staffId}>
                  {seller.staffName}: {seller.salesCount} sales /{" "}
                  {formatBdt(seller.grossSalesMinor)} sales /{" "}
                  {formatBdt(seller.returnsMinor)} returns /{" "}
                  {formatBdt(
                    seller.paymentsMinor +
                      seller.collectionsMinor -
                      seller.refundsMinor,
                  )}{" "}
                  net received
                </p>
              ))}
            </section>

            {/* Actual Drawer Count Inputs */}
            <section className={styles.countSection}>
              <h3>Actual Drawer Count (ক্যাশ ড্রয়ারে গণনা করা আসল টাকা)</h3>
              <div className={styles.inputGrid}>
                <div className={styles.inputField}>
                  <label htmlFor="actual-cash">
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <Coins size={16} /> Physical Cash (নগদ টাকা)
                    </span>
                    <button
                      type="button"
                      className={styles.denominationToggle}
                      onClick={() => setShowDenomCounter(!showDenomCounter)}
                    >
                      {showDenomCounter
                        ? "Hide Notes Counter"
                        : "Count Notes & Coins"}
                    </button>
                  </label>
                  <input
                    id="actual-cash"
                    type="text"
                    required
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className={styles.inputField}>
                  <label htmlFor="actual-mobile">
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <Smartphone size={16} /> Mobile Banking (bKash/Nagad)
                    </span>
                  </label>
                  <input
                    id="actual-mobile"
                    type="text"
                    required
                    value={mobileBankingInput}
                    onChange={(e) => setMobileBankingInput(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className={styles.inputField}>
                  <label htmlFor="actual-card">
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <CreditCard size={16} /> Card Terminal Total
                    </span>
                  </label>
                  <input
                    id="actual-card"
                    type="text"
                    required
                    value={cardInput}
                    onChange={(e) => setCardInput(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className={styles.inputField}>
                  <label htmlFor="actual-bank">
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <DollarSign size={16} /> Bank Transfer Total
                    </span>
                  </label>
                  <input
                    id="actual-bank"
                    type="text"
                    required
                    value={bankTransferInput}
                    onChange={(e) => setBankTransferInput(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Denomination Counter Accordion */}
              {showDenomCounter && (
                <div className={styles.denominationWrapper}>
                  <CashDenominationCounter
                    counts={denomCounts}
                    onChange={setDenomCounts}
                    onApply={handleApplyDenomination}
                  />
                </div>
              )}
            </section>

            {/* Real-time Discrepancy Banner */}
            <div
              className={`${styles.discrepancyBanner} ${
                status === "BALANCED"
                  ? styles.statusBalanced
                  : status === "SHORTAGE"
                    ? styles.statusShortage
                    : styles.statusOverage
              }`}
              data-testid="discrepancy-banner"
            >
              <div>
                <strong>
                  {status === "BALANCED" && "Drawer Balanced (সব মিল আছে)"}
                  {status === "SHORTAGE" && "Cash Drawer Shortage (টাকা ঘাটতি)"}
                  {status === "OVERAGE" &&
                    "Cash Drawer Overage (অতিরিক্ত টাকা জমা)"}
                </strong>
                <div style={{ fontSize: "0.85rem", marginTop: 2 }}>
                  Actual Count: <strong>{formatBdt(actualTotalMinor)}</strong> |
                  Variance:{" "}
                  <strong>
                    {totalDiscrepancyMinor > 0 ? "+" : ""}
                    {formatBdt(totalDiscrepancyMinor)}
                  </strong>
                </div>
              </div>
              <span className={styles.discrepancyStatusBadge}>{status}</span>
            </div>

            {/* Mandatory Discrepancy Reason if not balanced */}
            {hasDiscrepancy && (
              <section className={styles.reasonSection}>
                <label
                  style={{
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "#b91c1c",
                  }}
                >
                  Discrepancy Reason (গরমিলের কারণ উল্লেখ করুন) *
                </label>
                <div className={styles.quickReasons}>
                  {QUICK_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={styles.quickReasonBtn}
                      onClick={() => setDiscrepancyReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <textarea
                  className={styles.textarea}
                  required
                  placeholder="Explain why the drawer has an overage or shortage..."
                  value={discrepancyReason}
                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                  rows={2}
                  data-testid="discrepancy-reason-input"
                />
              </section>
            )}

            {/* Optional Closing Notes */}
            <section className={styles.reasonSection}>
              <label
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "#475569",
                }}
              >
                Closing Notes (মন্তব্য - ঐচ্ছিক)
              </label>
              <textarea
                className={styles.textarea}
                placeholder="Any special remarks regarding register handover..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={2}
              />
            </section>

            <div className={styles.warningBox}>
              <AlertTriangle size={20} />
              <span>
                Register settlement closes this sales session permanently. You
                will not be able to process further sales under this session ID.
              </span>
            </div>

            <footer className={styles.footer}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={submitting}
                data-testid="confirm-settlement-btn"
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={16} className="pos-spin" />
                    Settling Register...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Confirm & Close Register
                  </>
                )}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
