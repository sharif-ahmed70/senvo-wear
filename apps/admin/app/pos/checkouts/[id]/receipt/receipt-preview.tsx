"use client";

import type { SalesReceiptContract } from "@senvo/contracts";
import { CircleAlert, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminPermissionKey } from "../../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../../_lib/api-client";
import { useAdminPermissions } from "../../../../admin-shell";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});

export function ReceiptPreview({
  checkoutId,
  permissions: propsPermissions,
}: {
  checkoutId: string;
  permissions?: readonly AdminPermissionKey[];
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");

  const [receipt, setReceipt] = useState<SalesReceiptContract | null>(null);
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    const timer = setTimeout(() => {
      void client
        .getPosReceipt(checkoutId)
        .then((result) => setReceipt(result.data))
        .catch((reason: unknown) => setError(messageFor(reason)))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [canRead, checkoutId]);

  if (!canRead) {
    return <ReceiptState title="Receipt access unavailable" />;
  }
  if (loading) {
    return <ReceiptState loading title="Loading receipt" />;
  }
  if (error || !receipt) {
    return <ReceiptState title={error ?? "Receipt was not found."} />;
  }

  return (
    <main className="receipt-page">
      <div className="receipt-actions">
        <button type="button" onClick={() => window.print()}>
          <Printer size={17} /> Print
        </button>
      </div>
      <ReceiptDocument receipt={receipt} />
    </main>
  );
}

export function ReceiptDocument({
  receipt,
}: {
  receipt: SalesReceiptContract;
}) {
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
          <span>Sales receipt</span>
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
          <dt>Payment</dt>
          <dd>{label(receipt.paymentStatus)}</dd>
        </div>
        {receipt.customerName ? (
          <div>
            <dt>Customer</dt>
            <dd>{receipt.customerName}</dd>
          </div>
        ) : null}
        {receipt.customerPhone ? (
          <div>
            <dt>Phone</dt>
            <dd>{receipt.customerPhone}</dd>
          </div>
        ) : null}
      </dl>

      <div className="receipt-table-wrap">
        <table className="receipt-table">
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
                  <strong>{line.productName}</strong>
                  <span>
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

      <div className="receipt-summary">
        <dl>
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
          <div className="receipt-total">
            <dt>Total</dt>
            <dd>{money(receipt.totalMinor)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{money(receipt.paidMinor)}</dd>
          </div>
          <div>
            <dt>Outstanding</dt>
            <dd>{money(receipt.outstandingMinor)}</dd>
          </div>
        </dl>
      </div>

      <section className="receipt-payments">
        <h2>Payments</h2>
        {receipt.payments.length ? (
          receipt.payments.map((payment) => (
            <div key={payment.lineNumber}>
              <span>
                {label(payment.method)}
                {payment.reference ? ` | ${payment.reference}` : ""}
              </span>
              <strong>{money(payment.amountMinor)}</strong>
            </div>
          ))
        ) : (
          <p>No payment recorded. This sale has an outstanding balance.</p>
        )}
      </section>
    </article>
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
    <main className="receipt-page">
      <div className="receipt-state">
        <Icon className={loading ? "spin" : ""} />
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
