"use client";

import type {
  PaymentAccountContract,
  PaymentMethodContract,
  PosCheckoutContract,
} from "@senvo/contracts";
import {
  CircleAlert,
  LoaderCircle,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AdminPermissionKey } from "../../../_lib/admin-access";
import { AdminApiClient, AdminApiError } from "../../../_lib/api-client";
import { formatBdt, parseTaka, takaInput } from "../../sell/_lib/money";

const client = new AdminApiClient({
  baseUrl: process.env.NEXT_PUBLIC_SENVO_API_URL ?? "",
});
type DraftLine = {
  amount: string;
  method: PaymentMethodContract;
  reference: string;
};
const blankLine = (amount = ""): DraftLine => ({
  amount,
  method: "CASH",
  reference: "",
});

export function CheckoutPaymentWorkspace({
  checkoutId,
  permissions,
}: {
  checkoutId: string;
  permissions: readonly AdminPermissionKey[];
}) {
  const canRead =
    permissions.includes("POS:READ") && permissions.includes("PAYMENT:READ");
  const canCollect = canRead && permissions.includes("PAYMENT:CREATE");
  const canReadReceipt =
    permissions.includes("RECEIPT:READ") &&
    permissions.includes("PAYMENT:READ");
  const [checkout, setCheckout] = useState<PosCheckoutContract | null>(null);
  const [account, setAccount] = useState<PaymentAccountContract | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [loading, setLoading] = useState(canRead);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    amountMinor: number;
    cumulativePaidMinor: number;
    outstandingMinor: number;
    receiptId: string;
    receiptNumber: string;
    status: string;
  } | null>(null);
  const attemptKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const [checkoutResult, accountResult] = await Promise.all([
        client.getPosCheckout(checkoutId),
        client.getPosPaymentAccount(checkoutId),
      ]);
      setCheckout(checkoutResult.data);
      setAccount(accountResult.data);
      if (
        accountResult.data.outstandingMinor &&
        accountResult.data.outstandingMinor > 0
      )
        setLines([blankLine(takaInput(accountResult.data.outstandingMinor))]);
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
    if (!account?.outstandingMinor) return;
    const payments = lines.map((line) => ({
      amountMinor: parseTaka(line.amount),
      method: line.method,
      reference: line.reference.trim() || undefined,
    }));
    if (
      payments.some(
        (line) => line.amountMinor === null || line.amountMinor <= 0,
      )
    ) {
      setError("Enter a valid amount for every payment.");
      return;
    }
    if (payments.some((line) => line.method !== "CASH" && !line.reference)) {
      setError("Add a transaction reference for every non-cash payment.");
      return;
    }
    const total = payments.reduce(
      (sum, line) => sum + (line.amountMinor ?? 0),
      0,
    );
    if (total > account.outstandingMinor) {
      setError("Payment cannot be more than the amount due.");
      return;
    }
    attemptKey.current ??= `collection-${crypto.randomUUID()}`;
    setSaving(true);
    setError(null);
    try {
      const result = await client.collectPosPayment({
        checkoutId,
        idempotencyKey: attemptKey.current,
        payments: payments.map((line) => ({
          amountMinor: line.amountMinor as number,
          method: line.method,
          ...(line.reference ? { reference: line.reference } : {}),
        })),
      });
      setAccount(result.data.account);
      setSuccess({
        amountMinor: result.data.collection.amountMinor,
        cumulativePaidMinor: result.data.account.cumulativePaidMinor ?? 0,
        outstandingMinor: result.data.account.outstandingMinor ?? 0,
        receiptId: result.data.collection.id,
        receiptNumber: result.data.collection.receiptNumber,
        status: result.data.account.status,
      });
      setUncertain(false);
      attemptKey.current = null;
      if (result.data.account.outstandingMinor)
        setLines([blankLine(takaInput(result.data.account.outstandingMinor))]);
    } catch (reason) {
      setUncertain(
        !(reason instanceof AdminApiError) ||
          reason.code === "INTEGRATION.NETWORK_FAILURE",
      );
      if (
        reason instanceof AdminApiError &&
        ["BUSINESS_RULE.VIOLATION", "CONCURRENCY.CONFLICT"].includes(
          reason.code,
        )
      ) {
        try {
          setAccount((await client.getPosPaymentAccount(checkoutId)).data);
        } catch {
          // Preserve the actionable collection error if refresh also fails.
        }
      }
      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead)
    return (
      <State
        title="Payment access unavailable"
        text="Your role does not include payment history access."
      />
    );
  if (loading)
    return (
      <State
        loading
        title="Loading payment details"
        text="Getting the latest amount paid and amount due."
      />
    );
  if (!account || !checkout)
    return (
      <State
        title="Payment details unavailable"
        text={error ?? "This checkout could not be found."}
      />
    );
  const enteredMinor = lines.reduce(
    (sum, line) => sum + (parseTaka(line.amount) ?? 0),
    0,
  );
  const remainingMinor = Math.max(
    0,
    (account.outstandingMinor ?? 0) - enteredMinor,
  );
  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span>Checkout payment</span>
          <h1>{checkout.orderNumber}</h1>
          <p>
            {checkout.counterName} | {checkout.staffName}
          </p>
        </div>
        <Link
          className="pos-receipt-link"
          href={`/pos/checkouts/${checkoutId}/receipt`}
        >
          Original sales receipt
        </Link>
      </header>
      {error ? (
        <p className="pos-form-error">
          <CircleAlert size={16} /> {error}
        </p>
      ) : null}
      {success ? (
        <section className="pos-sale-success">
          <span>Payment recorded</span>
          <h2>
            {success.status === "PAID" ? "Paid in full" : "Payment saved"}
          </h2>
          <dl className="pos-payment-summary">
            <div>
              <span>Amount received</span>
              <strong>{formatBdt(success.amountMinor)}</strong>
            </div>
            <div>
              <span>Total amount paid</span>
              <strong>{formatBdt(success.cumulativePaidMinor)}</strong>
            </div>
            <div>
              <span>Amount due</span>
              <strong>{formatBdt(success.outstandingMinor)}</strong>
            </div>
          </dl>
          <div className="receipt-actions">
            {canReadReceipt ? (
              <>
                <Link
                  href={`/pos/payment-collections/${success.receiptId}/receipt`}
                >
                  View payment receipt
                </Link>
                <Link
                  target="_blank"
                  href={`/pos/payment-collections/${success.receiptId}/receipt`}
                >
                  Print payment receipt
                </Link>
              </>
            ) : null}
            <button type="button" onClick={() => setSuccess(null)}>
              {success.outstandingMinor > 0
                ? "Collect another payment"
                : "Back to sale"}
            </button>
          </div>
        </section>
      ) : null}
      <section className="receipt-summary">
        <dl>
          <div>
            <dt>Order total</dt>
            <dd>{formatBdt(account.totalMinor)}</dd>
          </div>
          <div>
            <dt>Amount paid</dt>
            <dd>
              {account.cumulativePaidMinor === null
                ? "Not recorded"
                : formatBdt(account.cumulativePaidMinor)}
            </dd>
          </div>
          <div className="receipt-total">
            <dt>Amount due</dt>
            <dd>
              {account.outstandingMinor === null
                ? "Not recorded"
                : formatBdt(account.outstandingMinor)}
            </dd>
          </div>
        </dl>
      </section>
      {!account.legacyPaymentRecorded ? (
        <State
          title="Collection unavailable"
          text="Payment collection is unavailable for this older sale because payment history was not recorded."
        />
      ) : account.outstandingMinor === 0 ? (
        <State
          title="Paid in full"
          text="No balance remains on this checkout."
        />
      ) : canCollect ? (
        <form
          className="pos-payment-panel"
          onSubmit={(event) => void submit(event)}
        >
          <header>
            <div>
              <span>Collect outstanding payment</span>
              <h2>Record payment</h2>
            </div>
            <button
              type="button"
              disabled={uncertain || lines.length >= 8}
              onClick={() => setLines((current) => [...current, blankLine()])}
            >
              <Plus size={16} /> Add method
            </button>
          </header>
          <div className="pos-payment-summary">
            <div>
              <span>Amount due</span>
              <strong>{formatBdt(account.outstandingMinor ?? 0)}</strong>
            </div>
            <div>
              <span>Entered payment</span>
              <strong>{formatBdt(enteredMinor)}</strong>
            </div>
            <div>
              <span>Remaining due</span>
              <strong>{formatBdt(remainingMinor)}</strong>
            </div>
          </div>
          {uncertain ? (
            <p className="pos-form-error">
              We could not confirm whether the payment was recorded. Retry
              safely with the same details to check the result.
            </p>
          ) : null}
          {lines.map((line, index) => (
            <div className="pos-payment-line" key={index}>
              <label>
                Method
                <select
                  disabled={uncertain}
                  value={line.method}
                  onChange={(e) =>
                    setLines((current) =>
                      current.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              method: e.target.value as PaymentMethodContract,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="MOBILE_BANKING">Mobile banking</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </label>
              <label>
                Amount (BDT)
                <input
                  disabled={uncertain}
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    setLines((current) =>
                      current.map((item, i) =>
                        i === index
                          ? { ...item, amount: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              {line.method !== "CASH" ? (
                <label>
                  Transaction reference
                  <input
                    disabled={uncertain}
                    value={line.reference}
                    onChange={(e) =>
                      setLines((current) =>
                        current.map((item, i) =>
                          i === index
                            ? { ...item, reference: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              ) : null}
              {lines.length > 1 ? (
                <button
                  disabled={uncertain}
                  type="button"
                  title="Remove payment method"
                  onClick={() =>
                    setLines((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={17} />
                </button>
              ) : null}
            </div>
          ))}
          <button
            className="pos-primary-button"
            disabled={saving}
            type="submit"
          >
            {saving ? (
              <LoaderCircle className="barcode-spin" size={17} />
            ) : (
              <ReceiptText size={17} />
            )}{" "}
            Record payment
          </button>
        </form>
      ) : (
        <State
          title="Collection access unavailable"
          text="Your role can view this balance but cannot collect payments."
        />
      )}
      <section className="receipt-payments">
        <h2>Original payment</h2>
        {account.initialPayments.length > 0 ? (
          account.initialPayments.map((payment, index) => (
            <div key={`${payment.method}-${index}`}>
              <span>
                {paymentMethodLabel(payment.method)}
                {payment.reference ? ` | ${payment.reference}` : ""}
              </span>
              <strong>{formatBdt(payment.amountMinor)}</strong>
            </div>
          ))
        ) : (
          <p>No payment was received when this sale was completed.</p>
        )}
      </section>
      <h2>Payment history</h2>
      <section className="pos-table-wrap">
        <table className="pos-table">
          <thead>
            <tr>
              <th>Collected</th>
              <th>Team member</th>
              <th>Amount</th>
              <th>Balance after</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {account.collections.map((item) => (
              <tr key={item.id}>
                <td data-label="Collected">
                  {new Date(item.createdAt).toLocaleString("en-BD")}
                </td>
                <td data-label="Team member">{item.acceptedByName}</td>
                <td data-label="Amount">{formatBdt(item.amountMinor)}</td>
                <td data-label="Balance after">
                  {formatBdt(item.balanceAfterMinor)}
                </td>
                <td data-label="Receipt">
                  {canReadReceipt ? (
                    <Link
                      className="pos-receipt-link"
                      href={`/pos/payment-collections/${item.id}/receipt`}
                    >
                      View
                    </Link>
                  ) : (
                    "Restricted"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
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
    <section className="pos-state">
      <Icon className={loading ? "barcode-spin" : undefined} />
      <strong>{title}</strong>
      <p>{text}</p>
    </section>
  );
}
function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError))
    return "We could not confirm the payment result. Retry safely.";
  const messages: Partial<Record<string, string>> = {
    "AUTHORIZATION.FORBIDDEN":
      "You do not have permission to record this payment.",
    "BUSINESS_RULE.VIOLATION":
      "The amount due changed. Review the latest balance before recording payment.",
    "CONCURRENCY.CONFLICT":
      "The amount due changed. Review the latest balance before recording payment.",
    "INTEGRATION.NETWORK_FAILURE":
      "We could not confirm the payment result. Retry safely.",
    "VALIDATION.INVALID_INPUT":
      "Review the payment amount and transaction reference.",
  };
  return `${messages[reason.code] ?? reason.message} (${reason.requestId})`;
}
function paymentMethodLabel(value: PaymentMethodContract) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
