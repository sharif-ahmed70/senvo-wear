"use client";

import type {
  PaymentMethodContract,
  PaymentRefundAccountContract,
} from "@senvo/contracts";
import {
  CircleAlert,
  LoaderCircle,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { useAdminPermissions } from "../../../admin-shell";
import { formatBdt, parseTaka, takaInput } from "../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
export type RefundDraftLine = {
  amount: string;
  method: PaymentMethodContract;
  reference: string;
};
export const maxRefundMethodLines = 8;
const blankLine = (amount = ""): RefundDraftLine => ({
  amount,
  method: "CASH",
  reference: "",
});
const methodLabels: Record<PaymentMethodContract, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  MOBILE_BANKING: "Mobile banking",
};

export function CheckoutRefundWorkspace({
  checkoutId,
  permissions: propsPermissions,
}: {
  checkoutId: string;
  permissions?: readonly AdminPermissionKey[];
}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const canRead =
    permissions.includes("POS:READ") &&
    permissions.includes("SALES:READ") &&
    permissions.includes("PAYMENT:READ");
  const canCreate =
    canRead &&
    permissions.includes("PAYMENT:CREATE") &&
    permissions.includes("PAYMENT:APPROVE");
  const canReadReceipt =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ") &&
    permissions.includes("SALES:READ");
  const [account, setAccount] = useState<PaymentRefundAccountContract | null>(
    null,
  );
  const [lines, setLines] = useState<RefundDraftLine[]>([blankLine()]);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(canRead);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    amountMinor: number;
    id: string;
    outstandingMinor: number;
    receiptNumber: string;
    refundableMinor: number;
  } | null>(null);
  const attempt = useRef<{ key: string; signature: string } | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.getPosRefunds(checkoutId);
      setAccount(result.data);
      if (result.data.refundableMinor && result.data.refundableMinor > 0)
        setLines((current) =>
          current.some((line) => line.amount)
            ? current
            : [blankLine(takaInput(result.data.refundableMinor ?? 0))],
        );
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, [canRead, checkoutId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account?.refundableMinor) return;
    const refunds = createRefundPayload(lines);
    if (
      refunds.some((line) => line.amountMinor === null || line.amountMinor <= 0)
    ) {
      setError("Enter a valid amount for every refund method.");
      return;
    }
    if (refunds.some((line) => line.method !== "CASH" && !line.reference)) {
      setError("Add a transaction reference for every non-cash refund.");
      return;
    }
    const total = refunds.reduce(
      (sum, line) => sum + (line.amountMinor ?? 0),
      0,
    );
    if (total > account.refundableMinor) {
      setError("Refund cannot be more than the amount currently due.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that the money has been returned to the customer.");
      return;
    }
    const normalized = refunds.map((line) => ({
      amountMinor: line.amountMinor as number,
      method: line.method,
      ...(line.reference ? { reference: line.reference } : {}),
    }));
    const signature = JSON.stringify(normalized);
    if (!attempt.current || attempt.current.signature !== signature)
      attempt.current = { key: `refund-${crypto.randomUUID()}`, signature };
    setSaving(true);
    setError(null);
    try {
      const result = await client.createPosRefund({
        checkoutId,
        idempotencyKey: attempt.current.key,
        refunds: normalized,
      });
      setAccount(result.data.account);
      setSuccess({
        amountMinor: result.data.refund.amountMinor,
        id: result.data.refund.id,
        outstandingMinor: result.data.account.outstandingMinor ?? 0,
        receiptNumber: result.data.refund.receiptNumber,
        refundableMinor: result.data.account.refundableMinor ?? 0,
      });
      setConfirmed(false);
      setUncertain(false);
      attempt.current = null;
      setLines(
        result.data.account.refundableMinor
          ? [blankLine(takaInput(result.data.account.refundableMinor))]
          : [blankLine()],
      );
    } catch (reason) {
      setUncertain(
        !(reason instanceof AdminApiError) ||
          reason.code === "INTEGRATION.NETWORK_FAILURE",
      );
      setError(messageFor(reason));
      if (
        reason instanceof AdminApiError &&
        ["BUSINESS_RULE.VIOLATION", "CONCURRENCY.CONFLICT"].includes(
          reason.code,
        )
      ) {
        try {
          setAccount((await client.getPosRefunds(checkoutId)).data);
        } catch {
          // Keep the refund error visible when reconciliation also fails.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canRead)
    return (
      <State
        title="Refund access unavailable"
        text="Your role does not include refund history access."
      />
    );
  if (loading)
    return (
      <State
        loading
        title="Loading refunds"
        text="Checking the latest refund due and history."
      />
    );
  if (!account)
    return (
      <State
        title="Refund information unavailable"
        text={error ?? "This sale could not be loaded."}
      />
    );

  const enteredMinor = lines.reduce(
    (sum, line) => sum + (parseTaka(line.amount) ?? 0),
    0,
  );
  const hasExternalMethod = lines.some((line) => line.method !== "CASH");
  return (
    <section className="pos-payment-page" aria-labelledby="refund-heading">
      <header className="pos-page-heading">
        <div>
          <span>Customer refund</span>
          <h2 id="refund-heading">
            Record money returned for {account.orderNumber}
          </h2>
          <p>
            Record a refund only after the money has been returned to the
            customer.
          </p>
        </div>
        <button
          className="pos-secondary-button"
          onClick={() => void load()}
          type="button"
        >
          <RotateCcw size={16} /> Refresh
        </button>
      </header>

      {error ? (
        <p className="pos-form-error">
          <CircleAlert size={16} /> {error}
        </p>
      ) : null}
      {uncertain ? (
        <p className="pos-form-warning">
          The result is uncertain. Retry the same details to safely recover the
          existing refund.
        </p>
      ) : null}
      {success ? (
        <section className="pos-sale-success">
          <span>Refund recorded</span>
          <h3>{formatBdt(success.amountMinor)} returned</h3>
          <p>Receipt {success.receiptNumber} is saved with this sale.</p>
          <div className="pos-payment-summary">
            <div>
              <span>Refund still due</span>
              <strong>{formatBdt(success.refundableMinor)}</strong>
            </div>
            <div>
              <span>Amount still due</span>
              <strong>{formatBdt(success.outstandingMinor)}</strong>
            </div>
          </div>
          {canReadReceipt ? (
            <div className="pos-success-actions">
              <Link
                className="pos-receipt-link"
                href={`/pos/refunds/${success.id}/receipt`}
              >
                <ReceiptText size={17} /> View refund receipt
              </Link>
              <Link
                className="pos-receipt-link"
                href={`/pos/refunds/${success.id}/receipt?print=1`}
              >
                Print refund receipt
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="pos-payment-summary">
        <div>
          <span>Gross received</span>
          <strong>{formatBdt(account.grossReceivedMinor ?? 0)}</strong>
        </div>
        <div>
          <span>Already refunded</span>
          <strong>{formatBdt(account.cumulativeRefundedMinor ?? 0)}</strong>
        </div>
        <div>
          <span>Net received</span>
          <strong>{formatBdt(account.netReceivedMinor ?? 0)}</strong>
        </div>
        <div>
          <span>Refund due now</span>
          <strong>{formatBdt(account.refundableMinor ?? 0)}</strong>
        </div>
      </section>

      {account.legacyPaymentRecorded && (account.refundableMinor ?? 0) > 0 ? (
        canCreate ? (
          <form
            className="pos-payment-form"
            onSubmit={(event) => void submit(event)}
          >
            <div className="pos-page-heading">
              <div>
                <h3>Refund methods</h3>
                <p>Split the refund across methods when needed.</p>
              </div>
              <button
                className="pos-secondary-button"
                disabled={lines.length >= maxRefundMethodLines}
                onClick={() => setLines(appendRefundMethod)}
                title={
                  lines.length >= maxRefundMethodLines
                    ? "A refund can use up to 8 methods."
                    : undefined
                }
                type="button"
              >
                <Plus size={16} /> Add method
              </button>
            </div>
            {lines.map((line, index) => (
              <div className="pos-payment-line" key={index}>
                <label>
                  Method
                  <select
                    value={line.method}
                    onChange={(event) =>
                      updateLine(
                        index,
                        { method: event.target.value as PaymentMethodContract },
                        setLines,
                      )
                    }
                  >
                    {Object.entries(methodLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount (BDT)
                  <input
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(event) =>
                      updateLine(
                        index,
                        { amount: event.target.value },
                        setLines,
                      )
                    }
                  />
                </label>
                <label>
                  Reference
                  <input
                    disabled={line.method === "CASH"}
                    placeholder={
                      line.method === "CASH" ? "Not needed" : "Required"
                    }
                    value={line.reference}
                    onChange={(event) =>
                      updateLine(
                        index,
                        { reference: event.target.value },
                        setLines,
                      )
                    }
                  />
                </label>
                <button
                  aria-label="Remove refund method"
                  className="pos-icon-button"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((items) =>
                      items.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
            <div className="pos-payment-summary">
              <div>
                <span>Refund being recorded</span>
                <strong>{formatBdt(enteredMinor)}</strong>
              </div>
              <div>
                <span>Refund due afterward</span>
                <strong>
                  {formatBdt(
                    Math.max(0, (account.refundableMinor ?? 0) - enteredMinor),
                  )}
                </strong>
              </div>
            </div>
            <label className="pos-confirmation">
              <input
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                type="checkbox"
              />{" "}
              {hasExternalMethod
                ? "I confirm this refund has already been issued outside SENVO. SENVO will record it as completed."
                : "I confirm the cash has been handed to the customer."}
            </label>
            <button
              className="pos-primary-button"
              disabled={saving}
              type="submit"
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ReceiptText size={17} />
              )}{" "}
              Issue refund
            </button>
          </form>
        ) : (
          <State
            title="Refund approval unavailable"
            text="Your role can view refunds but cannot record one."
          />
        )
      ) : (
        <State
          title={
            account.legacyPaymentRecorded
              ? "No refund is due"
              : "Refund unavailable for this older sale"
          }
          text={
            account.legacyPaymentRecorded
              ? "The recorded money returned matches the current sale credit."
              : "This sale does not have the detailed payment record needed for refund tracking."
          }
        />
      )}

      <section className="pos-payment-history">
        <h3>Refund history</h3>
        {account.refunds.length === 0 ? (
          <p>No money refunds have been recorded.</p>
        ) : (
          account.refunds.map((refund) => (
            <article key={refund.id}>
              <div>
                <strong>{formatBdt(refund.amountMinor)}</strong>
                <span>
                  {new Date(refund.issuedAt).toLocaleString("en-BD")} |{" "}
                  {refund.acceptedByName}
                </span>
              </div>
              {canReadReceipt ? (
                <Link href={`/pos/refunds/${refund.id}/receipt`}>
                  {refund.receiptNumber}
                </Link>
              ) : (
                <span>{refund.receiptNumber}</span>
              )}
            </article>
          ))
        )}
      </section>
    </section>
  );
}

function updateLine(
  index: number,
  patch: Partial<RefundDraftLine>,
  setLines: Dispatch<SetStateAction<RefundDraftLine[]>>,
) {
  setLines((items) => updateRefundMethod(items, index, patch));
}

export function updateRefundMethod(
  items: readonly RefundDraftLine[],
  index: number,
  patch: Partial<RefundDraftLine>,
): RefundDraftLine[] {
  return items.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          ...patch,
          ...(patch.method === "CASH" ? { reference: "" } : {}),
        }
      : item,
  );
}

export function appendRefundMethod(
  items: readonly RefundDraftLine[],
): RefundDraftLine[] {
  return items.length >= maxRefundMethodLines
    ? [...items]
    : [...items, blankLine()];
}

export function createRefundPayload(items: readonly RefundDraftLine[]) {
  return items.map((line) => ({
    amountMinor: parseTaka(line.amount),
    method: line.method,
    ...(line.method === "CASH"
      ? {}
      : { reference: line.reference.trim() || undefined }),
  }));
}
function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError))
    return "Refund could not be recorded. Try again safely.";
  if (reason.code === "CONFLICT.IDEMPOTENCY")
    return "This refund attempt was already used with different details.";
  if (reason.code === "BUSINESS_RULE.VIOLATION")
    return "Refresh the sale and check the current refund due.";
  if (reason.code === "CONCURRENCY.CONFLICT")
    return "The sale changed. Refresh and try again.";
  return reason.message;
}
function State({
  loading,
  text,
  title,
}: {
  loading?: boolean;
  text: string;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : CircleAlert;
  return (
    <section className="pos-payment-state">
      <Icon className={loading ? "spin" : undefined} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}
