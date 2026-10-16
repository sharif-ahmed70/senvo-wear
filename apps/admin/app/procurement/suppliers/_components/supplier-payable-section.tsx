"use client";

import type {
  CreateSupplierPaymentServiceInputContract,
  SupplierBalanceSummaryContract,
  SupplierContract,
  SupplierLedgerEntryContract,
  SupplierPaymentContract,
  SupplierPaymentMethodContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CreditCard,
  Plus,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import styles from "./supplier-payable.module.css";

const client = new AdminApiClient();

export function formatPayableAmount(
  minor: string | number | bigint | undefined | null,
): string {
  if (minor === undefined || minor === null) return "৳০.০০";
  const num =
    typeof minor === "string"
      ? Number(minor)
      : typeof minor === "bigint"
        ? Number(minor)
        : minor;

  if (isNaN(num)) return "৳০.০০";
  const isNegative = num < 0;
  const absTaka = Math.abs(num) / 100;
  const formatted = `৳${absTaka.toLocaleString("en-BD", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
  return isNegative ? `-${formatted}` : formatted;
}

export function formatPayableDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "অপ্রত্যাশিত ত্রুটি ঘটেছে। পুনরায় চেষ্টা করুন।";
}

// ---------------------------------------------------------------------------
// 1. Supplier Balance Card
// ---------------------------------------------------------------------------
export type SupplierBalanceCardProps = {
  canCreatePayment?: boolean;
  error?: string | null;
  loading?: boolean;
  onOpenPaymentModal?: () => void;
  onRefresh?: () => void;
  summary: SupplierBalanceSummaryContract | null;
};

export function SupplierBalanceCard({
  canCreatePayment = true,
  error,
  loading = false,
  onOpenPaymentModal,
  onRefresh,
  summary,
}: SupplierBalanceCardProps) {
  if (loading && !summary) {
    return (
      <div className={styles.balanceCard}>
        <div className={styles.stateBox} style={{ padding: "2rem 1rem" }}>
          <RefreshCw
            className={styles.stateIcon}
            size={28}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className={styles.stateDescription}>
            দেনা ও ব্যালেন্স তথ্য লোড হচ্ছে...
          </p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className={styles.balanceCard}>
        <div className={styles.stateBox} style={{ padding: "2rem 1rem" }}>
          <AlertCircle className={styles.stateIcon} size={32} />
          <h3 className={styles.stateTitle}>ব্যালেন্স লোড করা সম্ভব হয়নি</h3>
          <p className={styles.stateDescription}>{error}</p>
          {onRefresh && (
            <button
              className={styles.secondaryButton}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw size={14} />
              <span>পুনরায় চেষ্টা করুন</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const outstandingMinor = summary
    ? BigInt(summary.outstandingBalanceMinor)
    : 0n;
  const isDue = outstandingMinor > 0n;
  const isSettled = outstandingMinor === 0n;
  const isCredit = outstandingMinor < 0n;

  return (
    <div className={styles.balanceCard}>
      <div className={styles.balanceHeader}>
        <div className={styles.balanceTitleGroup}>
          <h2 className={styles.balanceTitle}>
            <Wallet size={20} />
            <span>সরবরাহকারী দেনা ও ব্যালেন্স (Payable & Balance)</span>
          </h2>
          <p className={styles.balanceSubtitle}>
            ক্রয় বিল ও পরিশোধের বর্তমান আর্থিক সারসংক্ষেপ
          </p>
        </div>

        <div className={styles.balanceHeaderActions}>
          {isDue && (
            <span className={`${styles.statusPill} ${styles.statusDue}`}>
              বকেয়া দেনা বাকি (Due)
            </span>
          )}
          {isSettled && (
            <span className={`${styles.statusPill} ${styles.statusSettled}`}>
              সম্পূর্ণ পরিশোধিত (Settled)
            </span>
          )}
          {isCredit && (
            <span className={`${styles.statusPill} ${styles.statusCredit}`}>
              অগ্রিম জমা (Advance Credit)
            </span>
          )}

          {onRefresh && (
            <button
              aria-label="Refresh balance"
              className={styles.secondaryButton}
              disabled={loading}
              onClick={onRefresh}
              title="তথ্য রিফ্রেশ করুন"
              type="button"
            >
              <RefreshCw
                size={15}
                style={
                  loading ? { animation: "spin 1s linear infinite" } : undefined
                }
              />
            </button>
          )}

          {canCreatePayment && onOpenPaymentModal && (
            <button
              className={styles.primaryButton}
              onClick={onOpenPaymentModal}
              type="button"
            >
              <Plus size={16} />
              <span>পেমেন্ট পরিশোধ রেকর্ড</span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.metricsGrid}>
        <div className={`${styles.metricBox} ${styles.metricBoxProminent}`}>
          <span className={styles.metricLabel}>
            বর্তমান বকেয়া (Outstanding Due)
          </span>
          <span
            className={`${styles.metricValue} ${
              isDue
                ? styles.metricValueDue
                : isSettled
                  ? styles.metricValueSettled
                  : styles.metricValuePaid
            }`}
          >
            {formatPayableAmount(summary?.outstandingBalanceMinor ?? "0")}
          </span>
        </div>

        <div className={styles.metricBox}>
          <span className={styles.metricLabel}>
            মোট ক্রয় বিল (Total Billed)
          </span>
          <span className={styles.metricValue}>
            {formatPayableAmount(summary?.totalBilledMinor ?? "0")}
          </span>
        </div>

        <div className={styles.metricBox}>
          <span className={styles.metricLabel}>মোট পরিশোধ (Total Paid)</span>
          <span className={`${styles.metricValue} ${styles.metricValuePaid}`}>
            {formatPayableAmount(summary?.totalPaidMinor ?? "0")}
          </span>
        </div>

        <div className={styles.metricBox}>
          <span className={styles.metricLabel}>
            মোট সমন্বয়/ক্রেডিট (Adjusted)
          </span>
          <span className={styles.metricValue}>
            {formatPayableAmount(summary?.totalAdjustedMinor ?? "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Supplier Payment Entry Modal / Form
// ---------------------------------------------------------------------------
export type SupplierPaymentModalProps = {
  defaultPurchaseId?: string;
  onClose: () => void;
  onSuccess: (payment: SupplierPaymentContract) => void;
  supplier: SupplierContract;
};

export function SupplierPaymentModal({
  defaultPurchaseId,
  onClose,
  onSuccess,
  supplier,
}: SupplierPaymentModalProps) {
  const [amountTaka, setAmountTaka] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPaymentMethodContract>("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const taka = parseFloat(amountTaka.trim());
    if (isNaN(taka) || taka <= 0) {
      setError("সঠিক পেমেন্টের পরিমাণ উল্লেখ করুন (অবশ্যই ০-এর বেশি হতে হবে)।");
      return;
    }

    if (!paymentDate) {
      setError("পেমেন্টের তারিখ নির্বাচন করুন।");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const amountMinor = BigInt(Math.round(taka * 100)).toString();
      const input: CreateSupplierPaymentServiceInputContract = {
        amountMinor,
        idempotencyKey: crypto.randomUUID(),
        notes: notes.trim() || undefined,
        paymentDate: new Date(paymentDate).toISOString(),
        paymentMethod,
        purchaseId: defaultPurchaseId || undefined,
        reference: reference.trim() || undefined,
        supplierId: supplier.id,
      };

      const result = await client.recordSupplierPayment(input);
      onSuccess(result.data);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-labelledby="payment-modal-title"
      aria-modal="true"
      className={styles.modalOverlay}
      role="dialog"
    >
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle} id="payment-modal-title">
              পেমেন্ট পরিশোধ রেকর্ড (Record Payment)
            </h2>
            <p
              className={styles.balanceSubtitle}
              style={{ marginTop: "0.25rem" }}
            >
              সরবরাহকারী: <strong>{supplier.name}</strong> ({supplier.code})
            </p>
          </div>
          <button
            aria-label="Close modal"
            className={styles.modalCloseBtn}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className={styles.modalBody}>
            {error && (
              <div
                className={`${styles.alertBox} ${styles.alertError}`}
                role="alert"
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="payment-amount">
                পরিশোধের পরিমাণ (Amount in Taka){" "}
                <span className={styles.formLabelRequired}>*</span>
              </label>
              <div className={styles.inputWithPrefix}>
                <span className={styles.inputPrefix}>৳</span>
                <input
                  autoFocus
                  className={`${styles.formInput} ${styles.formInputPrefixed}`}
                  id="payment-amount"
                  min="0.01"
                  onChange={(e) => setAmountTaka(e.target.value)}
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                  value={amountTaka}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="payment-date">
                পেমেন্টের তারিখ (Payment Date){" "}
                <span className={styles.formLabelRequired}>*</span>
              </label>
              <input
                className={styles.formInput}
                id="payment-date"
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                type="date"
                value={paymentDate}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="payment-method">
                পদ্ধতি (Payment Method){" "}
                <span className={styles.formLabelRequired}>*</span>
              </label>
              <select
                className={styles.formSelect}
                id="payment-method"
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as SupplierPaymentMethodContract,
                  )
                }
                value={paymentMethod}
              >
                <option value="CASH">ক্যাশ / নগদ (Cash)</option>
                <option value="BANK_TRANSFER">
                  ব্যাংক ট্রান্সফার (Bank Transfer)
                </option>
                <option value="CHEQUE">চেক (Cheque)</option>
                <option value="MOBILE_BANKING">
                  মোবাইল ব্যাংকিং (bKash / Nagad / Rocket)
                </option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="payment-ref">
                রেফারেন্স বা স্লিপ নম্বর (Reference / Cheque / TxID)
              </label>
              <input
                className={styles.formInput}
                id="payment-ref"
                onChange={(e) => setReference(e.target.value)}
                placeholder="যেমন: Cheque #10293 বা TrxID: 98AKL"
                type="text"
                value={reference}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="payment-notes">
                মন্তব্য বা বিবরণ (Notes)
              </label>
              <textarea
                className={styles.formTextarea}
                id="payment-notes"
                onChange={(e) => setNotes(e.target.value)}
                placeholder="পেমেন্ট সংক্রান্ত কোনো বিবরণ বা মন্তব্য..."
                rows={2}
                value={notes}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              className={styles.secondaryButton}
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              বাতিল
            </button>
            <button
              className={styles.primaryButton}
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <RefreshCw
                    size={16}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                  <span>সংরক্ষণ করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>পেমেন্ট নিশ্চিত করুন</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Supplier Ledger Transaction Timeline
// ---------------------------------------------------------------------------
export type SupplierLedgerTimelineProps = {
  entries?: SupplierLedgerEntryContract[];
  error?: string | null;
  loading?: boolean;
  onRefresh?: () => void;
  supplierId: string;
};

export function SupplierLedgerTimeline({
  entries: propEntries,
  error: propError,
  loading: propLoading,
  onRefresh,
  supplierId,
}: SupplierLedgerTimelineProps) {
  const [entries, setEntries] = useState<SupplierLedgerEntryContract[]>(
    propEntries ?? [],
  );
  const [loading, setLoading] = useState(
    propLoading ?? (propEntries === undefined && !propError),
  );
  const [error, setError] = useState(propError ?? "");
  const [filterType, setFilterType] = useState<"ALL" | "BILL" | "PAYMENT">(
    "ALL",
  );

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await client.getSupplierLedger(supplierId, { limit: 100 });
      setEntries(result.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (propEntries !== undefined) {
      setEntries(propEntries);
      setLoading(false);
      return;
    }
    void loadLedger();
  }, [propEntries, loadLedger]);

  const filteredEntries = entries.filter((e) => {
    if (filterType === "ALL") return true;
    return e.entryType === filterType;
  });

  return (
    <div className={styles.timelineCard}>
      <div className={styles.timelineHeader}>
        <div className={styles.balanceTitleGroup}>
          <h3 className={styles.balanceTitle}>
            <CreditCard size={18} />
            <span>লেজার লেনদেন ইতিহাস (Ledger Transactions)</span>
          </h3>
          <p className={styles.balanceSubtitle}>
            ক্রয় বিল ও পরিশোধের সময়ানুক্রমিক তালিকা
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className={styles.timelineFilters}>
            <button
              className={`${styles.timelineFilterBtn} ${
                filterType === "ALL" ? styles.timelineFilterBtnActive : ""
              }`}
              onClick={() => setFilterType("ALL")}
              type="button"
            >
              সকল ({entries.length})
            </button>
            <button
              className={`${styles.timelineFilterBtn} ${
                filterType === "BILL" ? styles.timelineFilterBtnActive : ""
              }`}
              onClick={() => setFilterType("BILL")}
              type="button"
            >
              ক্রয় বিল
            </button>
            <button
              className={`${styles.timelineFilterBtn} ${
                filterType === "PAYMENT" ? styles.timelineFilterBtnActive : ""
              }`}
              onClick={() => setFilterType("PAYMENT")}
              type="button"
            >
              পরিশোধ
            </button>
          </div>

          <button
            aria-label="Refresh ledger"
            className={styles.secondaryButton}
            disabled={loading}
            onClick={() => {
              if (onRefresh) onRefresh();
              else void loadLedger();
            }}
            title="লেজার রিফ্রেশ করুন"
            type="button"
          >
            <RefreshCw
              size={15}
              style={
                loading ? { animation: "spin 1s linear infinite" } : undefined
              }
            />
          </button>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className={styles.stateBox}>
          <RefreshCw
            className={styles.stateIcon}
            size={28}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className={styles.stateDescription}>
            লেনদেনের ইতিহাস লোড হচ্ছে...
          </p>
        </div>
      ) : error && entries.length === 0 ? (
        <div className={styles.stateBox} role="alert">
          <AlertCircle className={styles.stateIcon} size={32} />
          <h4 className={styles.stateTitle}>লেনদেন লোড করা সম্ভব হয়নি</h4>
          <p className={styles.stateDescription}>{error}</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void loadLedger()}
            type="button"
          >
            <RefreshCw size={14} />
            <span>পুনরায় চেষ্টা করুন</span>
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className={styles.stateBox}>
          <CreditCard className={styles.stateIcon} size={36} />
          <h4 className={styles.stateTitle}>কোনো লেনদেন পাওয়া যায়নি</h4>
          <p className={styles.stateDescription}>
            এই সরবরাহকারীর জন্য নির্বাচিত ফিল্টারে কোনো বিল বা পেমেন্ট রেকর্ড
            নেই।
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>তারিখ ও সময়</th>
                <th>লেনদেনের ধরন</th>
                <th>দিক / প্রভাব</th>
                <th style={{ textAlign: "right" }}>পরিমাণ</th>
                <th>রেফারেন্স / নোট</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isDebit = entry.direction === "DEBIT";
                return (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatPayableDate(entry.entryDate)}
                    </td>
                    <td>
                      <span
                        className={`${styles.typeBadge} ${
                          entry.entryType === "BILL"
                            ? styles.typeBill
                            : entry.entryType === "PAYMENT"
                              ? styles.typePayment
                              : entry.entryType === "RETURN_CREDIT"
                                ? styles.typeReturnCredit
                                : entry.entryType === "ADJUSTMENT"
                                  ? styles.typeAdjustment
                                  : styles.typeOpening
                        }`}
                      >
                        {entry.entryType === "BILL"
                          ? "ক্রয় বিল (Bill)"
                          : entry.entryType === "PAYMENT"
                            ? "পরিশোধ (Payment)"
                            : entry.entryType === "RETURN_CREDIT"
                              ? "ফেরত ক্রেডিট"
                              : entry.entryType === "ADJUSTMENT"
                                ? "সমন্বয় (Adjustment)"
                                : "প্রারম্ভিক জের"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.directionBadge} ${
                          isDebit
                            ? styles.directionDebit
                            : styles.directionCredit
                        }`}
                      >
                        {isDebit ? (
                          <>
                            <ArrowDownRight size={14} />
                            <span>দেনা হ্রাস (- Debit)</span>
                          </>
                        ) : (
                          <>
                            <ArrowUpRight size={14} />
                            <span>দেনা বৃদ্ধি (+ Credit)</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span
                        className={
                          isDebit ? styles.amountDebit : styles.amountCredit
                        }
                      >
                        {isDebit ? "-" : "+"}
                        {formatPayableAmount(entry.amountMinor)}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.125rem",
                        }}
                      >
                        {entry.referenceId && (
                          <span style={{ fontWeight: 500 }}>
                            {entry.referenceId}
                          </span>
                        )}
                        {entry.notes && (
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              color: "#64748b",
                            }}
                          >
                            {entry.notes}
                          </span>
                        )}
                        {!entry.referenceId && !entry.notes && (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Combined Supplier Payable Section (Card + Modal + Timeline)
// ---------------------------------------------------------------------------
export type SupplierPayableSectionProps = {
  canCreatePayment?: boolean;
  initialBalance?: SupplierBalanceSummaryContract | null;
  initialLedger?: SupplierLedgerEntryContract[];
  supplier: SupplierContract;
};

export function SupplierPayableSection({
  canCreatePayment = true,
  initialBalance,
  initialLedger,
  supplier,
}: SupplierPayableSectionProps) {
  const [balance, setBalance] = useState<SupplierBalanceSummaryContract | null>(
    initialBalance ?? null,
  );
  const [balanceLoading, setBalanceLoading] = useState(
    initialBalance === undefined,
  );
  const [balanceError, setBalanceError] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [ledgerKey, setLedgerKey] = useState(0);
  const [successToast, setSuccessToast] = useState("");

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const result = await client.getSupplierBalance(supplier.id);
      setBalance(result.data);
    } catch (err) {
      setBalanceError(errorMessage(err));
    } finally {
      setBalanceLoading(false);
    }
  }, [supplier.id]);

  useEffect(() => {
    if (initialBalance !== undefined) {
      setBalance(initialBalance);
      setBalanceLoading(false);
      return;
    }
    void loadBalance();
  }, [initialBalance, loadBalance]);

  function handlePaymentSuccess(payment: SupplierPaymentContract) {
    setIsPaymentModalOpen(false);
    setSuccessToast(
      `পেমেন্ট সফলভাবে সংরক্ষিত হয়েছে: ${formatPayableAmount(payment.amountMinor)} (${payment.paymentMethod})`,
    );
    void loadBalance();
    setLedgerKey((k) => k + 1);
  }

  return (
    <div className={styles.payableSection}>
      {successToast && (
        <div
          className={`${styles.alertBox} ${styles.alertSuccess}`}
          role="status"
        >
          <Check size={18} />
          <span>{successToast}</span>
          <button
            onClick={() => setSuccessToast("")}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Balance Summary Card */}
      <SupplierBalanceCard
        canCreatePayment={canCreatePayment}
        error={balanceError}
        loading={balanceLoading}
        onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
        onRefresh={() => void loadBalance()}
        summary={balance}
      />

      {/* Ledger Transaction Timeline */}
      <SupplierLedgerTimeline
        entries={ledgerKey === 0 && initialLedger ? initialLedger : undefined}
        onRefresh={() => {
          void loadBalance();
          setLedgerKey((k) => k + 1);
        }}
        supplierId={supplier.id}
      />

      {/* Payment Entry Modal */}
      {isPaymentModalOpen && (
        <SupplierPaymentModal
          onClose={() => setIsPaymentModalOpen(false)}
          onSuccess={handlePaymentSuccess}
          supplier={supplier}
        />
      )}
    </div>
  );
}
