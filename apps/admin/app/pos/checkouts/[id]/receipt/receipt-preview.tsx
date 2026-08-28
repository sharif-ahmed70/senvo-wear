"use client";

import type { SalesReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "../../../_components/receipt-document.module.css";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function ReceiptPreview({
  checkoutId,
  permissions,
}: {
  checkoutId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");
  const [receipt, setReceipt] = useState<SalesReceiptContract | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(() => {
      void client
        .getPosReceipt(checkoutId)
        .then((result) => setReceipt(result.data))
        .catch((reason: unknown) => setError(messageFor(reason)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canRead, checkoutId]);

  if (!canRead) {
    return <ReceiptState title="Receipt access unavailable" />;
  }
  if (loading) {
    return <ReceiptState loading title="Loading sales receipt" />;
  }
  if (error || !receipt) {
    return <ReceiptState title={error ?? "Receipt was not found."} />;
  }

  const address = [
    receipt.organizationAddressLine1,
    receipt.organizationAddressLine2,
    receipt.organizationCity,
    receipt.organizationDistrict,
    receipt.organizationPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const contact = [receipt.organizationPhone, receipt.organizationEmail]
    .filter(Boolean)
    .join(" | ");

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <button
          className={styles.toolbarButton}
          type="button"
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" size={17} /> Print receipt
        </button>
      </div>

      <article className={styles.document}>
        <header className={styles.documentHeader}>
          <div className={styles.brand}>
            <h1>{receipt.organizationName}</h1>
            {address ? <p>{address}</p> : null}
            {contact ? <p>{contact}</p> : null}
          </div>
          <div className={styles.identity}>
            <span>Sales receipt</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
        </header>

        <dl className={styles.meta}>
          <div>
            <dt>Order</dt>
            <dd>{receipt.orderNumber}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{formatDate(receipt.issuedAt)}</dd>
          </div>
          <div>
            <dt>Sales source</dt>
            <dd>{receipt.sourceName}</dd>
          </div>
          <div>
            <dt>Counter</dt>
            <dd>
              {receipt.counterName} ({receipt.counterCode})
            </dd>
          </div>
          <div>
            <dt>Team member</dt>
            <dd>{receipt.staffName}</dd>
          </div>
          <div>
            <dt>Payment status</dt>
            <dd className={styles.status}>{label(receipt.paymentStatus)}</dd>
          </div>
        </dl>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>Items</h2>
            <p>{receipt.lines.length} line{receipt.lines.length === 1 ? "" : "s"}</p>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.lineNumber}>
                    <td>
                      <span className={styles.itemName}>{line.productName}</span>
                      <span className={styles.itemMeta}>
                        {[line.sku, line.color, line.size]
                          .filter(Boolean)
                          .join(" | ")}
                      </span>
                    </td>
                    <td>{line.quantity}</td>
                    <td>{money(line.unitPriceMinor)}</td>
                    <td>{money(line.lineTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>Payments</h2>
          </div>
          {receipt.payments.length ? (
            <div className={styles.paymentList}>
              {receipt.payments.map((payment) => (
                <div className={styles.paymentRow} key={payment.lineNumber}>
                  <span>
                    {label(payment.method)}
                    {payment.reference ? ` | ${payment.reference}` : ""}
                  </span>
                  <strong>{money(payment.amountMinor)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>
              No payment was recorded when this sale was completed.
            </p>
          )}
        </section>

        <dl className={styles.summary}>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(receipt.subtotalMinor)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{money(receipt.discountMinor)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{money(receipt.deliveryMinor)}</dd>
          </div>
          <div className={styles.summaryTotal}>
            <dt>Total</dt>
            <dd>{money(receipt.totalMinor)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{money(receipt.paidMinor)}</dd>
          </div>
          <div className={receipt.outstandingMinor > 0 ? styles.due : undefined}>
            <dt>Outstanding</dt>
            <dd>{money(receipt.outstandingMinor)}</dd>
          </div>
        </dl>
      </article>
    </main>
  );
}

function ReceiptState({
  loading = false,
  title,
}: {
  loading?: boolean;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : CircleAlert;
  return (
    <main className={styles.statePage}>
      <div className={styles.state}>
        <Icon className={loading ? styles.spin : undefined} aria-hidden="true" />
        <strong>{title}</strong>
      </div>
    </main>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (first) => first.toUpperCase());
}

function messageFor(reason: unknown) {
  return reason instanceof AdminApiError
    ? `${reason.message} Request ${reason.requestId}.`
    : "The receipt could not be loaded.";
}
