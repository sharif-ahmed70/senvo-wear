"use client";

import type {
  CreateSupplierPaymentServiceInputContract,
  SupplierContract,
  SupplierPaymentContract,
  SupplierPaymentMethodContract,
} from "@senvo/contracts";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../_components/page-header";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { useAdminPermissions } from "../../../admin-shell";
import {
  formatPayableAmount,
  formatPayableDate,
} from "../../suppliers/_components/supplier-payable-section";
import styles from "./payments-workspace.module.css";

const client = new AdminApiClient();

const PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethodContract, string> = {
  BANK_TRANSFER: "ব্যাংক ট্রান্সফার (Bank)",
  CASH: "ক্যাশ / নগদ (Cash)",
  CHEQUE: "চেক (Cheque)",
  MOBILE_BANKING: "মোবাইল ব্যাংকিং (MFS)",
};

function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "অপ্রত্যাশিত ত্রুটি ঘটেছে। পুনরায় চেষ্টা করুন।";
}

export type PaymentsWorkspaceProps = {
  initialError?: string;
  initialPayments?: SupplierPaymentContract[];
  initialSuppliers?: SupplierContract[];
  permissions?: readonly AdminPermissionKey[];
  supplierId?: string;
  view?: "list" | "new";
};

export function PaymentsWorkspace({
  initialError,
  initialPayments,
  initialSuppliers,
  permissions: propsPermissions,
  supplierId: propSupplierId,
  view = "list",
}: PaymentsWorkspaceProps) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;

  const canRead = permissions.includes("PROCUREMENT:READ");
  const canCreate = permissions.includes("PROCUREMENT:CREATE");

  if (!canRead) {
    return (
      <div className={styles.container}>
        <PageHeader
          description="সরবরাহকারী পেমেন্ট সংক্রান্ত তথ্য দেখার অনুমতি নেই।"
          eyebrow="Procurement / পেমেন্ট"
          title="প্রবেশাধিকার সংরক্ষিত (Access Restricted)"
        />
        <div className={styles.stateBox} role="alert">
          <ShieldCheck className={styles.stateIcon} size={40} />
          <h2 className={styles.stateTitle}>পেমেন্ট দেখার অনুমতি নেই</h2>
          <p className={styles.stateDescription}>
            আপনার অ্যাকাউন্টে সরবরাহকারী পেমেন্ট তালিকা দেখার অনুমতি নেই।
          </p>
        </div>
      </div>
    );
  }

  if (view === "new") {
    return (
      <NewPaymentForm
        canCreate={canCreate}
        initialSuppliers={initialSuppliers}
        supplierId={propSupplierId}
      />
    );
  }

  return (
    <PaymentsListPanel
      canCreate={canCreate}
      initialError={initialError}
      initialPayments={initialPayments}
      initialSuppliers={initialSuppliers}
    />
  );
}

// ---------------------------------------------------------------------------
// 1. Payments List Panel
// ---------------------------------------------------------------------------
export function PaymentsListPanel({
  canCreate,
  initialError,
  initialPayments,
  initialSuppliers,
}: {
  canCreate: boolean;
  initialError?: string;
  initialPayments?: SupplierPaymentContract[];
  initialSuppliers?: SupplierContract[];
}) {
  const [payments, setPayments] = useState<SupplierPaymentContract[]>(
    initialPayments ?? [],
  );
  const [suppliers, setSuppliers] = useState<SupplierContract[]>(
    initialSuppliers ?? [],
  );
  const [loading, setLoading] = useState(
    initialPayments === undefined && !initialError,
  );
  const [error, setError] = useState(initialError ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [paymentsRes, suppliersRes] = await Promise.all([
        client.listSupplierPayments(),
        client.listSuppliers(),
      ]);
      setPayments(paymentsRes.data);
      if (suppliersRes.data) {
        setSuppliers(suppliersRes.data);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialPayments !== undefined || initialError !== undefined) {
      return;
    }
    void loadData();
  }, [initialError, initialPayments, loadData]);

  const supplierMap = useMemo(() => {
    return new Map(suppliers.map((s) => [s.id, s]));
  }, [suppliers]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (methodFilter !== "ALL" && p.paymentMethod !== methodFilter) {
        return false;
      }
      if (supplierFilter !== "ALL" && p.supplierId !== supplierFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const sup = supplierMap.get(p.supplierId);
        const nameMatch = sup?.name.toLowerCase().includes(query) ?? false;
        const codeMatch = sup?.code.toLowerCase().includes(query) ?? false;
        const refMatch = p.reference?.toLowerCase().includes(query) ?? false;
        const notesMatch = p.notes?.toLowerCase().includes(query) ?? false;
        return nameMatch || codeMatch || refMatch || notesMatch;
      }
      return true;
    });
  }, [payments, methodFilter, supplierFilter, searchQuery, supplierMap]);

  const totalPaidMinor = useMemo(() => {
    return filteredPayments.reduce((acc, p) => acc + BigInt(p.amountMinor), 0n);
  }, [filteredPayments]);

  return (
    <div className={styles.container}>
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          justifyContent: "space-between",
        }}
      >
        <PageHeader
          description="সরবরাহকারীদের পরিশোধিত মোট অর্থ ও পেমেন্টের তালিকা।"
          eyebrow="Procurement / সরবরাহকারী পেমেন্ট"
          title="সরবরাহকারী পেমেন্ট হিসাব (Supplier Payments)"
        />
        <div className={styles.headerActions}>
          <button
            aria-label="Refresh payments"
            className={styles.secondaryButton}
            disabled={loading}
            onClick={() => void loadData()}
            title="তথ্য রিফ্রেশ করুন"
            type="button"
          >
            <RefreshCw
              size={16}
              style={
                loading ? { animation: "spin 1s linear infinite" } : undefined
              }
            />
            <span>রিফ্রেশ</span>
          </button>
          {canCreate && (
            <Link
              className={styles.primaryButton}
              href="/procurement/payments/new"
            >
              <Plus size={16} />
              <span>নতুন পেমেন্ট রেকর্ড করুন</span>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            onClick={() => setError("")}
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

      {/* Summary stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>মোট পেমেন্ট সংখ্যা</span>
          <span className={styles.statValue}>{filteredPayments.length} টি</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>সর্বমোট পরিশোধিত অর্থ</span>
          <span className={styles.statValue} style={{ color: "#15803d" }}>
            {formatPayableAmount(totalPaidMinor.toString())}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchBox}>
          <Search size={16} style={{ color: "#94a3b8" }} />
          <input
            aria-label="Search payments"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="রেফারেন্স, সরবরাহকারী বা নোট দিয়ে খুঁজুন..."
            type="text"
            value={searchQuery}
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select
            aria-label="Filter by supplier"
            className={styles.filterSelect}
            onChange={(e) => setSupplierFilter(e.target.value)}
            value={supplierFilter}
          >
            <option value="ALL">সকল সরবরাহকারী (All Suppliers)</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by method"
            className={styles.filterSelect}
            onChange={(e) => setMethodFilter(e.target.value)}
            value={methodFilter}
          >
            <option value="ALL">সকল পেমেন্ট পদ্ধতি (All Methods)</option>
            <option value="CASH">ক্যাশ / নগদ</option>
            <option value="BANK_TRANSFER">ব্যাংক ট্রান্সফার</option>
            <option value="CHEQUE">চেক</option>
            <option value="MOBILE_BANKING">মোবাইল ব্যাংকিং</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading && payments.length === 0 ? (
        <div className={styles.stateBox}>
          <RefreshCw
            className={styles.stateIcon}
            size={32}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p className={styles.stateDescription}>পেমেন্ট তালিকা লোড হচ্ছে...</p>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className={styles.stateBox}>
          <Wallet className={styles.stateIcon} size={40} />
          <h3 className={styles.stateTitle}>কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি</h3>
          <p className={styles.stateDescription}>
            {searchQuery || methodFilter !== "ALL" || supplierFilter !== "ALL"
              ? "নির্বাচিত ফিল্টারে কোনো পেমেন্ট রেকর্ড মেলেনি।"
              : "এখনো কোনো সরবরাহকারী পেমেন্ট রেকর্ড করা হয়নি।"}
          </p>
          {canCreate && (
            <Link
              className={styles.primaryButton}
              href="/procurement/payments/new"
            >
              <Plus size={16} />
              <span>প্রথম পেমেন্ট রেকর্ড করুন</span>
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>তারিখ ও সময়</th>
                <th>সরবরাহকারী</th>
                <th>পদ্ধতি</th>
                <th style={{ textAlign: "right" }}>পরিমাণ</th>
                <th>রেফারেন্স / নোট</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => {
                const sup = supplierMap.get(p.supplierId);
                return (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatPayableDate(p.paymentDate)}
                    </td>
                    <td>
                      {sup ? (
                        <Link
                          href={`/procurement/suppliers/${sup.id}`}
                          style={{
                            fontWeight: 600,
                            color: "#0f172a",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                          }}
                        >
                          {sup.name}
                        </Link>
                      ) : (
                        <span style={{ color: "#64748b" }}>
                          সরবরাহকারী ({p.supplierId.slice(0, 8)})
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={styles.methodBadge}>
                        {PAYMENT_METHOD_LABELS[p.paymentMethod] ||
                          p.paymentMethod}
                      </span>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 600,
                        color: "#15803d",
                      }}
                    >
                      {formatPayableAmount(p.amountMinor)}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.125rem",
                        }}
                      >
                        {p.reference && (
                          <span style={{ fontWeight: 500 }}>{p.reference}</span>
                        )}
                        {p.notes && (
                          <span
                            style={{ fontSize: "0.8125rem", color: "#64748b" }}
                          >
                            {p.notes}
                          </span>
                        )}
                        {!p.reference && !p.notes && (
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
// 2. New Payment Form (Standalone Page Screen)
// ---------------------------------------------------------------------------
export function NewPaymentForm({
  canCreate,
  initialSuppliers,
  supplierId: propSupplierId,
}: {
  canCreate: boolean;
  initialSuppliers?: SupplierContract[];
  supplierId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSupplierId = searchParams.get("supplierId") ?? undefined;
  const targetSupplierId = propSupplierId ?? paramSupplierId ?? "";

  const [suppliers, setSuppliers] = useState<SupplierContract[]>(
    initialSuppliers ?? [],
  );
  const [selectedSupplierId, setSelectedSupplierId] =
    useState<string>(targetSupplierId);
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
  const [loadingSuppliers, setLoadingSuppliers] = useState(
    initialSuppliers === undefined,
  );

  useEffect(() => {
    if (initialSuppliers !== undefined) return;
    async function fetchSuppliers() {
      try {
        const res = await client.listSuppliers({ status: "ACTIVE" });
        setSuppliers(res.data);
        if (!selectedSupplierId && res.data.length > 0 && res.data[0]) {
          setSelectedSupplierId(res.data[0].id);
        }
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoadingSuppliers(false);
      }
    }
    void fetchSuppliers();
  }, [initialSuppliers, selectedSupplierId]);

  if (!canCreate) {
    return (
      <div className={styles.container}>
        <PageHeader
          description="পেমেন্ট এন্ট্রি করার অনুমতি নেই।"
          eyebrow="Procurement / নতুন পেমেন্ট"
          title="প্রবেশাধিকার সংরক্ষিত"
        />
        <div className={styles.stateBox} role="alert">
          <ShieldCheck className={styles.stateIcon} size={40} />
          <h2 className={styles.stateTitle}>পেমেন্ট রেকর্ডের অনুমতি নেই</h2>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupplierId) {
      setError("দয়া করে একজন সরবরাহকারী নির্বাচন করুন।");
      return;
    }

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
        reference: reference.trim() || undefined,
        supplierId: selectedSupplierId,
      };

      await client.recordSupplierPayment(input);
      router.push(`/procurement/suppliers/${selectedSupplierId}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div>
        <Link
          className={styles.secondaryButton}
          href="/procurement/payments"
          style={{ marginBottom: "1rem" }}
        >
          <ArrowLeft size={16} />
          <span>পেমেন্ট তালিকায় ফিরে যান</span>
        </Link>
        <PageHeader
          description="সরবরাহকারীকে দেওয়া অর্থ বা বিল পরিশোধের হিসাব সংরক্ষণ করুন।"
          eyebrow="Procurement / নতুন পেমেন্ট"
          title="সরবরাহকারী পেমেন্ট রেকর্ড (Record Payment)"
        />
      </div>

      <div className={styles.formCard}>
        {error && (
          <div
            className={`${styles.alertBox} ${styles.alertError}`}
            role="alert"
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form
          className={styles.formGrid}
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="supplier-select">
              সরবরাহকারী (Supplier){" "}
              <span className={styles.formLabelRequired}>*</span>
            </label>
            <select
              className={styles.formSelect}
              disabled={loadingSuppliers}
              id="supplier-select"
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              required
              value={selectedSupplierId}
            >
              <option value="">-- সরবরাহকারী নির্বাচন করুন --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-payment-amount">
              পরিশোধের পরিমাণ (Amount in Taka){" "}
              <span className={styles.formLabelRequired}>*</span>
            </label>
            <div className={styles.inputWithPrefix}>
              <span className={styles.inputPrefix}>৳</span>
              <input
                className={`${styles.formInput} ${styles.formInputPrefixed}`}
                id="new-payment-amount"
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
            <label className={styles.formLabel} htmlFor="new-payment-date">
              পেমেন্টের তারিখ (Payment Date){" "}
              <span className={styles.formLabelRequired}>*</span>
            </label>
            <input
              className={styles.formInput}
              id="new-payment-date"
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              type="date"
              value={paymentDate}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-payment-method">
              পদ্ধতি (Payment Method){" "}
              <span className={styles.formLabelRequired}>*</span>
            </label>
            <select
              className={styles.formSelect}
              id="new-payment-method"
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
            <label className={styles.formLabel} htmlFor="new-payment-ref">
              রেফারেন্স বা স্লিপ নম্বর (Reference / Cheque / TxID)
            </label>
            <input
              className={styles.formInput}
              id="new-payment-ref"
              onChange={(e) => setReference(e.target.value)}
              placeholder="যেমন: Cheque #10293 বা TrxID: 98AKL"
              type="text"
              value={reference}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="new-payment-notes">
              মন্তব্য বা বিবরণ (Notes)
            </label>
            <textarea
              className={styles.formTextarea}
              id="new-payment-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="পেমেন্ট সংক্রান্ত কোনো বিবরণ বা মন্তব্য..."
              rows={3}
              value={notes}
            />
          </div>

          <div className={styles.formActions}>
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
            <Link
              className={styles.secondaryButton}
              href="/procurement/payments"
            >
              বাতিল
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
