"use client";

import type { PosCheckoutContract } from "@senvo/contracts";
import {
  AlertCircle,
  Download,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient } from "../../../_lib/api-client";
import { useAdminPermissions } from "../../../admin-shell";
import styles from "./checkout-history-workspace.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

const paymentStatuses: Array<{
  label: string;
  value: "ALL" | PosCheckoutContract["paymentStatus"];
}> = [
  { label: "All payment states", value: "ALL" },
  { label: "Paid", value: "PAID" },
  { label: "Partially paid", value: "PARTIALLY_PAID" },
  { label: "Payment due", value: "UNPAID" },
  { label: "Settled by return", value: "SETTLED" },
  { label: "Refund due", value: "REFUND_DUE" },
  { label: "Not recorded", value: "UNRECORDED" },
];

export function CheckoutHistoryWorkspace({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const allowed = permissions.includes("POS:READ");

  const canCollect = permissions.includes("PAYMENT:CREATE");
  const canReadPayment = permissions.includes("PAYMENT:READ");
  const canReadReceipt = permissions.includes("RECEIPT:READ") && canReadPayment;

  if (!allowed) {
    return (
      <main className={styles.page}>
        <State
          icon={AlertCircle}
          title="Checkout History access is restricted"
          text="Your role does not include POS read access."
        />
      </main>
    );
  }

  return (
    <CheckoutHistoryContent
      canCollect={canCollect}
      canReadPayment={canReadPayment}
      canReadReceipt={canReadReceipt}
    />
  );
}

function CheckoutHistoryContent({
  canCollect,
  canReadPayment,
  canReadReceipt,
}: {
  canCollect: boolean;
  canReadPayment: boolean;
  canReadReceipt: boolean;
}) {
  const [checkouts, setCheckouts] = useState<PosCheckoutContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<
    "ALL" | PosCheckoutContract["paymentStatus"]
  >("ALL");
  const [dueFilter, setDueFilter] = useState<"ALL" | "DUE" | "CLEAR">("ALL");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const result = await client.listPosCheckouts();
      setCheckouts(result.data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Checkout history could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...checkouts]
      .filter((checkout) => {
        const searchable = [
          checkout.orderNumber,
          checkout.counterName,
          checkout.staffName,
        ].filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        );
        if (
          normalized &&
          !searchable.some((value) => value.toLowerCase().includes(normalized))
        )
          return false;
        if (paymentStatus !== "ALL" && checkout.paymentStatus !== paymentStatus)
          return false;
        const due = checkout.outstandingMinor ?? 0;
        if (dueFilter === "DUE" && due <= 0) return false;
        if (dueFilter === "CLEAR" && due > 0) return false;
        return true;
      })
      .sort(
        (left, right) =>
          new Date(right.completedAt).getTime() -
          new Date(left.completedAt).getTime(),
      );
  }, [checkouts, dueFilter, paymentStatus, query]);

  function exportCsv() {
    const rows = [
      [
        "Order",
        "Counter",
        "Team member",
        "Total BDT",
        "Paid BDT",
        "Due BDT",
        "Payment status",
        "Completed at",
      ],
      ...filtered.map((checkout) => [
        checkout.orderNumber,
        checkout.counterName,
        checkout.staffName,
        moneyNumber(checkout.totalMinor),
        checkout.paidMinor === null ? "" : moneyNumber(checkout.paidMinor),
        checkout.outstandingMinor === null
          ? ""
          : moneyNumber(checkout.outstandingMinor),
        paymentLabel(checkout.paymentStatus),
        new Date(checkout.completedAt).toISOString(),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `senvo-checkout-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Sales · POS</span>
          <h1>Checkout History</h1>
          <p>
            Review completed in-person sales, payment state, receipts and
            amounts still due.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            disabled={filtered.length === 0}
            onClick={exportCsv}
            type="button"
          >
            <Download aria-hidden="true" size={16} />
            Export CSV
          </button>
          <button
            className={styles.secondaryButton}
            disabled={refreshing}
            onClick={() => void load("refresh")}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? styles.spin : undefined}
              size={16}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Checkout history filters">
        <label className={styles.search}>
          <span>Search</span>
          <div>
            <Search aria-hidden="true" size={17} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Order number, counter or team member"
              type="search"
              value={query}
            />
          </div>
        </label>
        <label>
          <span>Payment status</span>
          <select
            onChange={(event) =>
              setPaymentStatus(
                event.target.value as
                  "ALL" | PosCheckoutContract["paymentStatus"],
              )
            }
            value={paymentStatus}
          >
            {paymentStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Balance</span>
          <select
            onChange={(event) =>
              setDueFilter(event.target.value as "ALL" | "DUE" | "CLEAR")
            }
            value={dueFilter}
          >
            <option value="ALL">All balances</option>
            <option value="DUE">Amount due</option>
            <option value="CLEAR">No amount due</option>
          </select>
        </label>
        <div className={styles.resultCount}>
          <span>Showing</span>
          <strong>{filtered.length}</strong>
          <small>of {checkouts.length} completed sales</small>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <div>
            <strong>Checkout history could not be loaded.</strong>
            <span>{error}</span>
          </div>
          <button onClick={() => void load("refresh")} type="button">
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <State
          icon={LoaderCircle}
          spin
          title="Loading checkout history"
          text="Getting completed counter and booth sales."
        />
      ) : checkouts.length === 0 ? (
        <State
          icon={ReceiptText}
          title="No completed sales yet"
          text="Completed POS sales will appear here after checkout."
        />
      ) : filtered.length === 0 ? (
        <State
          icon={Search}
          title="No matching checkouts"
          text="Try another order number, counter, team member or payment filter."
        />
      ) : (
        <section className={styles.tablePanel} aria-label="Completed POS sales">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Counter</th>
                  <th>Team member</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Payment</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((checkout) => {
                  const due = checkout.outstandingMinor ?? 0;
                  return (
                    <tr key={checkout.id}>
                      <td data-label="Order">
                        <Link
                          className={styles.orderLink}
                          href={`/pos/checkouts/${checkout.id}`}
                        >
                          {checkout.orderNumber}
                        </Link>
                      </td>
                      <td data-label="Counter">
                        <strong>{checkout.counterName}</strong>
                      </td>
                      <td data-label="Team member">{checkout.staffName}</td>
                      <td data-label="Total" className={styles.money}>
                        {formatMoney(checkout.totalMinor)}
                      </td>
                      <td data-label="Paid" className={styles.money}>
                        {checkout.paidMinor === null
                          ? "Not recorded"
                          : formatMoney(checkout.paidMinor)}
                      </td>
                      <td
                        data-label="Due"
                        className={`${styles.money} ${
                          due > 0 ? styles.due : ""
                        }`}
                      >
                        {checkout.outstandingMinor === null
                          ? "Not recorded"
                          : formatMoney(checkout.outstandingMinor)}
                      </td>
                      <td data-label="Payment">
                        <span
                          className={`${styles.status} ${statusClass(
                            checkout.paymentStatus,
                          )}`}
                        >
                          {paymentLabel(checkout.paymentStatus)}
                        </span>
                      </td>
                      <td data-label="Completed" className={styles.completed}>
                        {formatDate(checkout.completedAt)}
                      </td>
                      <td data-label="Actions">
                        <div className={styles.actions}>
                          {canReadReceipt && checkout.receiptId ? (
                            <Link
                              className={styles.textLink}
                              href={`/pos/checkouts/${checkout.id}/receipt`}
                            >
                              Receipt
                            </Link>
                          ) : null}
                          {canCollect && due > 0 ? (
                            <Link
                              className={styles.primaryLink}
                              href={`/pos/checkouts/${checkout.id}`}
                            >
                              Collect payment
                            </Link>
                          ) : canReadPayment ? (
                            <Link
                              className={styles.primaryLink}
                              href={`/pos/checkouts/${checkout.id}`}
                            >
                              View details
                            </Link>
                          ) : (
                            <span className={styles.restricted}>
                              Restricted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function State({
  icon: Icon,
  spin = false,
  text,
  title,
}: {
  icon: typeof ReceiptText;
  spin?: boolean;
  text: string;
  title: string;
}) {
  return (
    <section className={styles.state}>
      <Icon
        aria-hidden="true"
        className={spin ? styles.spin : undefined}
        size={28}
      />
      <strong>{title}</strong>
      <p>{text}</p>
    </section>
  );
}

function paymentLabel(value: PosCheckoutContract["paymentStatus"]) {
  switch (value) {
    case "PAID":
      return "Paid";
    case "PARTIALLY_PAID":
      return "Partially paid";
    case "UNPAID":
      return "Payment due";
    case "SETTLED":
      return "Settled by return";
    case "REFUND_DUE":
      return "Refund due";
    case "UNRECORDED":
      return "Not recorded";
  }
}

function statusClass(value: PosCheckoutContract["paymentStatus"]) {
  switch (value) {
    case "PAID":
      return styles.paid;
    case "PARTIALLY_PAID":
      return styles.partial;
    case "UNPAID":
      return styles.unpaid;
    case "SETTLED":
      return styles.settled;
    case "REFUND_DUE":
      return styles.refundDue;
    case "UNRECORDED":
      return styles.unrecorded;
  }
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-BD", {
    currency: "BDT",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(minor / 100);
}

function moneyNumber(minor: number) {
  return (minor / 100).toFixed(2);
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-BD", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function csvCell(value: string) {
  const text = value == null ? "" : String(value).replaceAll('"', '""');
  return `"${text}"`;
}
