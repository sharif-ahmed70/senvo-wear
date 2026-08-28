"use client";

import type { PaymentCollectionReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import styles from "../../../_components/receipt-document.module.css";
import { formatBdt } from "../../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function PaymentReceiptPreview({
  collectionId,
  permissions,
  printOnLoad = false,
}: {
  collectionId: string;
  permissions: readonly AdminPermissionKey[];
  printOnLoad?: boolean;
}) {
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");
  const [receipt, setReceipt] =
    useState<PaymentCollectionReceiptContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(
      () =>
        void client
          .getPaymentCollectionReceipt(collectionId)
          .then((result) => setReceipt(result.data))
          .catch((reason: unknown) =>
            setError(
              reason instanceof AdminApiError
                ? reason.message
                : "Payment receipt could not be loaded.",
            ),
          ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [canRead, collectionId]);

  useEffect(() => {
    if (receipt && printOnLoad) window.print();
  }, [printOnLoad, receipt]);

  if (!canRead) return <State title="Receipt access unavailable" />;
  if (error) return <State title={error} />;
  if (!receipt) return <State loading title="Loading payment receipt" />;

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
            <span>Payment receipt</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
        </header>

        <dl className={styles.meta}>
          <div>
            <dt>Order</dt>
            <dd>{receipt.orderNumber}</dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>{formatDate(receipt.collectedAt)}</dd>
          </div>
          <div>
            <dt>Received by</dt>
            <dd>{receipt.acceptedByName}</dd>
          </div>
          <div>
            <dt>Payment status</dt>
            <dd className={styles.status}>
              {receipt.paymentStatus === "PAID"
                ? "Paid in full"
                : "Partially paid"}
            </dd>
          </div>
        </dl>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>Payment received</h2>
          </div>
          <div className={styles.paymentList}>
            {receipt.payments.map((payment) => (
              <div className={styles.paymentRow} key={payment.lineNumber}>
                <span>
                  {label(payment.method)}
                  {payment.reference ? ` | ${payment.reference}` : ""}
                </span>
                <strong>{formatBdt(payment.amountMinor)}</strong>
              </div>
            ))}
          </div>
        </section>

        <dl className={styles.summary}>
          <div>
            <dt>Order total</dt>
            <dd>{formatBdt(receipt.totalMinor)}</dd>
          </div>
          <div className={styles.summaryTotal}>
            <dt>This payment</dt>
            <dd>{formatBdt(receipt.amountMinor)}</dd>
          </div>
          <div>
            <dt>Total paid</dt>
            <dd>{formatBdt(receipt.cumulativePaidMinor)}</dd>
          </div>
          <div className={receipt.outstandingMinor > 0 ? styles.due : undefined}>
            <dt>Amount due</dt>
            <dd>{formatBdt(receipt.outstandingMinor)}</dd>
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

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
