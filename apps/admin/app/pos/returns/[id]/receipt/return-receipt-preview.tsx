"use client";

import type { PosReturnReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { formatBdt } from "../../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function ReturnReceiptPreview({
  printOnLoad = false,
  returnId,
  permissions,
}: {
  printOnLoad?: boolean;
  returnId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ") &&
    permissions.includes("SALES:READ");
  const [receipt, setReceipt] = useState<PosReturnReceiptContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canRead) return;
    const timer = setTimeout(
      () =>
        void client
          .getPosReturnReceipt(returnId)
          .then((result) => setReceipt(result.data))
          .catch((reason: unknown) =>
            setError(
              reason instanceof AdminApiError
                ? reason.message
                : "Return receipt could not be loaded.",
            ),
          ),
      0,
    );
    return () => clearTimeout(timer);
  }, [canRead, returnId]);
  useEffect(() => {
    if (receipt && printOnLoad) window.print();
  }, [printOnLoad, receipt]);
  if (!canRead) return <State title="Receipt access unavailable" />;
  if (error) return <State title={error} />;
  if (!receipt) return <State loading title="Loading return receipt" />;
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
            <span>Return receipt</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
        </header>
        <dl className="receipt-meta">
          <div>
            <dt>Order</dt>
            <dd>{receipt.orderNumber}</dd>
          </div>
          <div>
            <dt>Returned</dt>
            <dd>{new Date(receipt.returnedAt).toLocaleString("en-BD")}</dd>
          </div>
          <div>
            <dt>Received by</dt>
            <dd>{receipt.acceptedByName}</dd>
          </div>
          <div>
            <dt>Return hold</dt>
            <dd>{receipt.destinationLocationName}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{label(receipt.reasonCode)}</dd>
          </div>
          {receipt.collectedReceiptNumber ? (
            <div>
              <dt>Original receipt</dt>
              <dd>{receipt.collectedReceiptNumber}</dd>
            </div>
          ) : null}
        </dl>
        <section className="receipt-lines">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.lineNumber}>
                  <td>
                    <strong>{line.productNameSnapshot}</strong>
                    <span>
                      {line.skuSnapshot} ·{" "}
                      {[line.colorSnapshot, line.sizeSnapshot]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                  </td>
                  <td>{line.quantity}</td>
                  <td>{formatBdt(line.lineCreditMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {receipt.reasonNote ? (
          <section className="receipt-payments">
            <h2>Return note</h2>
            <p>{receipt.reasonNote}</p>
          </section>
        ) : null}
        <div className="receipt-summary">
          <dl>
            <div>
              <dt>Original total</dt>
              <dd>{formatBdt(receipt.originalTotalMinor)}</dd>
            </div>
            <div>
              <dt>This return credit</dt>
              <dd>{formatBdt(receipt.totalCreditMinor)}</dd>
            </div>
            <div>
              <dt>Total return credit</dt>
              <dd>{formatBdt(receipt.cumulativeReturnCreditMinor)}</dd>
            </div>
            <div>
              <dt>Adjusted sale</dt>
              <dd>{formatBdt(receipt.adjustedPayableMinor)}</dd>
            </div>
            <div>
              <dt>Amount received</dt>
              <dd>{formatBdt(receipt.cumulativeReceivedMinor)}</dd>
            </div>
            <div>
              <dt>Amount due</dt>
              <dd>{formatBdt(receipt.outstandingMinor)}</dd>
            </div>
            <div className="receipt-total">
              <dt>Refund due</dt>
              <dd>{formatBdt(receipt.refundableMinor)}</dd>
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
