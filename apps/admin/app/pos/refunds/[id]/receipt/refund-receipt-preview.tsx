"use client";

import type { PaymentRefundReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";
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
  permissions: propsPermissions,
  printOnLoad = false,
  refundId,
}: {
  permissions?: readonly AdminPermissionKey[];
  printOnLoad?: boolean;
  refundId: string;
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
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
    const timer = setTimeout(
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
    return () => clearTimeout(timer);
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
  return (
    <main className="receipt-page">
      <div className="receipt-actions">
        <button onClick={() => window.print()} type="button">
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
            <span>Refund receipt</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
        </header>
        <dl className="receipt-meta">
          <div>
            <dt>Order</dt>
            <dd>{receipt.orderNumber}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{new Date(receipt.issuedAt).toLocaleString("en-BD")}</dd>
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
        <section className="receipt-payments">
          <h2>Money returned</h2>
          {receipt.lines.map((line) => (
            <div key={line.lineNumber}>
              <span>
                {line.method === "CASH"
                  ? "Cash refund issued"
                  : "External refund recorded as issued"}
                {` | ${methodLabels[line.method] ?? line.method}`}
                {line.reference ? ` | Reference: ${line.reference}` : ""}
              </span>
              <strong>{formatBdt(line.amountMinor)}</strong>
            </div>
          ))}
        </section>
        <div className="receipt-summary">
          <dl>
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
            <div>
              <dt>Amount still due</dt>
              <dd>{formatBdt(receipt.outstandingMinor)}</dd>
            </div>
            <div>
              <dt>Refund still due</dt>
              <dd>{formatBdt(receipt.refundableMinor)}</dd>
            </div>
            <div className="receipt-total">
              <dt>This refund</dt>
              <dd>{formatBdt(receipt.amountMinor)}</dd>
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
