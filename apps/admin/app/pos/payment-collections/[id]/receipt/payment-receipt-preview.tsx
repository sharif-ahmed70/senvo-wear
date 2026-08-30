"use client";

import type { PaymentCollectionReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";
import { formatBdt } from "../../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
export function PaymentReceiptPreview({
  collectionId,
  permissions: propsPermissions,
}: {
  collectionId: string;
  permissions?: readonly AdminPermissionKey[];
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");

  const [receipt, setReceipt] =
    useState<PaymentCollectionReceiptContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canRead) return;
    const timer = setTimeout(
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
    return () => clearTimeout(timer);
  }, [canRead, collectionId]);
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
  return (
    <main className="receipt-page">
      <div className="receipt-actions">
        <button type="button" onClick={() => window.print()}>
          <Printer size={17} /> Print
        </button>
      </div>
      <article className="receipt-document">
        <header className="receipt-header">
          <div>
            <h1>{receipt.organizationName}</h1>
            {address ? <p>{address}</p> : null}
            <p>
              {[receipt.organizationPhone, receipt.organizationEmail]
                .filter(Boolean)
                .join(" | ")}
            </p>
          </div>
          <div className="receipt-number">
            <span>Payment receipt</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
        </header>
        <dl className="receipt-meta">
          <div>
            <dt>Order</dt>
            <dd>{receipt.orderNumber}</dd>
          </div>
          <div>
            <dt>Collected</dt>
            <dd>{new Date(receipt.collectedAt).toLocaleString("en-BD")}</dd>
          </div>
          <div>
            <dt>Received by</dt>
            <dd>{receipt.acceptedByName}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {receipt.paymentStatus === "PAID"
                ? "Paid in full"
                : "Partially paid"}
            </dd>
          </div>
        </dl>
        <section className="receipt-payments">
          <h2>Payment received</h2>
          {receipt.payments.map((payment) => (
            <div key={payment.lineNumber}>
              <span>
                {label(payment.method)}
                {payment.reference ? ` | ${payment.reference}` : ""}
              </span>
              <strong>{formatBdt(payment.amountMinor)}</strong>
            </div>
          ))}
        </section>
        <div className="receipt-summary">
          <dl>
            <div>
              <dt>Order total</dt>
              <dd>{formatBdt(receipt.totalMinor)}</dd>
            </div>
            <div>
              <dt>This payment</dt>
              <dd>{formatBdt(receipt.amountMinor)}</dd>
            </div>
            <div>
              <dt>Total paid</dt>
              <dd>{formatBdt(receipt.cumulativePaidMinor)}</dd>
            </div>
            <div className="receipt-total">
              <dt>Amount due</dt>
              <dd>{formatBdt(receipt.outstandingMinor)}</dd>
            </div>
          </dl>
        </div>
      </article>
    </main>
  );
}
function State({ loading, title }: { loading?: boolean; title: string }) {
  const Icon = loading ? LoaderCircle : CircleAlert;
  return (
    <main className="receipt-page">
      <div className="receipt-state">
        <Icon className={loading ? "spin" : undefined} />
        <strong>{title}</strong>
      </div>
    </main>
  );
}
function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
