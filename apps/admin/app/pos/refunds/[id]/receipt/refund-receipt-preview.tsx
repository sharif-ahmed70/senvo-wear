"use client";

import type { PaymentRefundReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "../../../_components/receipt-document.module.css";
import { formatBdt } from "../../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
const methodLabels: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  MOBILE_BANKING: "Mobile banking",
};

export function RefundReceiptPreview({
  permissions,
  printOnLoad = false,
  refundId,
}: {
  permissions: readonly AdminPermissionKey[];
  printOnLoad?: boolean;
  refundId: string;
}) {
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ") &&
    permissions.includes("SALES:READ");
  const [receipt, setReceipt] = useState<PaymentRefundReceiptContract | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(
      () =>
        void client
          .getPosRefundReceipt(refundId)
          .then((result) => setReceipt(result.data))
          .catch((reason: unknown) =>
            setError(
              reason instanceof AdminApiError
                ? reason.message
                : "Refund receipt could not be loaded.",
            ),
          ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [canRead, refundId]);

  useEffect(() => {
    if (receipt && printOnLoad) window.print();
  }, [printOnLoad, receipt]);

  if (!canRead) return <State title="Receipt access unavailable" />;
  if (error) return <State title={error} />;
  if (!receipt) return <State loading title="Loading refund receipt" />;

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
          onClick={() => window.print()}
          type="button"
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
            <span>Refund receipt</span>
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
            <dt>Recorded by</dt>
            <dd>{receipt.acceptedByName}</dd>
          </div>
          {receipt.originalReceiptNumber ? (
            <div>
              <dt>Original receipt</dt>
              <dd>{receipt.originalReceiptNumber}</dd>
            </div>
          ) : null}
        </dl>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>Money returned</h2>
          </div>
          <div className={styles.paymentList}>
            {receipt.lines.map((line) => (
              <div className={styles.paymentRow} key={line.lineNumber}>
                <span>
                  {line.method === "CASH"
                    ? "Cash returned to customer"
                    : "External refund recorded"}
                  {` | ${methodLabels[line.method] ?? line.method}`}
                  {line.reference ? ` | ${line.reference}` : ""}
                </span>
                <strong>{formatBdt(line.amountMinor)}</strong>
              </div>
            ))}
          </div>
        </section>

        <dl className={styles.summary}>
          <div>
            <dt>Original sale</dt>
            <dd>{formatBdt(receipt.originalPayableMinor)}</dd>
          </div>
          <div>
            <dt>Adjusted sale</dt>
            <dd>{formatBdt(receipt.adjustedPayableMinor)}</dd>
          </div>
          <div>
            <dt>Gross received</dt>
            <dd>{formatBdt(receipt.grossReceivedMinor)}</dd>
          </div>
          <div>
            <dt>Total refunded</dt>
            <dd>{formatBdt(receipt.cumulativeRefundedMinor)}</dd>
          </div>
          <div>
            <dt>Net received</dt>
            <dd>{formatBdt(receipt.netReceivedMinor)}</dd>
          </div>
          <div className={receipt.outstandingMinor > 0 ? styles.due : undefined}>
            <dt>Amount still due</dt>
            <dd>{formatBdt(receipt.outstandingMinor)}</dd>
          </div>
          <div className={receipt.refundableMinor > 0 ? styles.refund : undefined}>
            <dt>Refund still due</dt>
            <dd>{formatBdt(receipt.refundableMinor)}</dd>
          </div>
          <div className={styles.summaryTotal}>
            <dt>This refund</dt>
            <dd>{formatBdt(receipt.amountMinor)}</dd>
          </div>
        </dl>
      </article>
    </main>
  );
}

function State({ loading, title }: { loading?: boolean; title: string }) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
