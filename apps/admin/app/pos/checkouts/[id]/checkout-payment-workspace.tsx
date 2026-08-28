"use client";

import type {
  PaymentAccountContract,
  PaymentMethodContract,
  PosCheckoutContract,
} from "@senvo/contracts";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  ReceiptText,
  Smartphone,
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
import styles from "./checkout-payment-workspace.module.css";

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
      ) {
        setLines([blankLine(takaInput(accountResult.data.outstandingMinor))]);
      }
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setLoading(false);
    }
  }, [canRead, checkoutId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
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

      if (result.data.account.outstandingMinor) {
        setLines([blankLine(takaInput(result.data.account.outstandingMinor))]);
      }
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
          // Keep the original collection error when the balance refresh also fails.
        }
      }

      setError(messageFor(reason));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <State
        title="Payment access unavailable"
        text="Your role does not include payment history access."
      />
    );
  }

  if (loading) {
    return (
      <State
        loading
        title="Loading payment details"
        text="Getting the latest paid amount, balance and collection history."
      />
    );
  }

  if (!account || !checkout) {
    return (
      <State
        title="Payment details unavailable"
        text={error ?? "This checkout could not be found."}
      />
    );
  }

  const enteredMinor = lines.reduce(
    (sum, line) => sum + (parseTaka(line.amount) ?? 0),
    0,
  );
  const outstandingMinor = account.outstandingMinor ?? 0;
  const remainingMinor = Math.max(0, outstandingMinor - enteredMinor);
  const hasDue = account.outstandingMinor !== null && outstandingMinor > 0;
  const isPaid = account.outstandingMinor === 0;

  return (
    <main className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Link href="/pos/checkouts">
          <ArrowLeft aria-hidden="true" size={15} />
          Checkout History
        </Link>
        <span aria-hidden="true">/</span>
        <strong>Payment details</strong>
      </div>

      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Checkout payment</span>
          <div className={styles.titleLine}>
            <h1>{checkout.orderNumber}</h1>
            <span
              className={`${styles.statusBadge} ${
                isPaid
                  ? styles.statusPaid
                  : hasDue
                    ? styles.statusDue
                    : styles.statusNeutral
              }`}
            >
              {isPaid ? "Paid in full" : hasDue ? "Amount due" : "Not recorded"}
            </span>
          </div>
          <p>
            Review the payment account and collect a remaining balance when
            permitted.
          </p>
        </div>

        {canReadReceipt && checkout.receiptId ? (
          <Link
            className={styles.receiptButton}
            href={`/pos/checkouts/${checkoutId}/receipt`}
          >
            <ReceiptText aria-hidden="true" size={16} />
            Original sales receipt
          </Link>
        ) : null}
      </header>

      <section className={styles.contextCard} aria-label="Checkout context">
        <div>
          <span>Sales counter</span>
          <strong>{checkout.counterName}</strong>
        </div>
        <div>
          <span>Team member</span>
          <strong>{checkout.staffName || "Team member"}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{formatDate(checkout.completedAt)}</strong>
        </div>
      </section>

      <section className={styles.balanceGrid} aria-label="Payment balance">
        <article>
          <span>Order total</span>
          <strong>{formatBdt(account.totalMinor)}</strong>
        </article>
        <article>
          <span>Amount paid</span>
          <strong>
            {account.cumulativePaidMinor === null
              ? "Not recorded"
              : formatBdt(account.cumulativePaidMinor)}
          </strong>
        </article>
        <article className={hasDue ? styles.dueCard : undefined}>
          <span>Amount due</span>
          <strong>
            {account.outstandingMinor === null
              ? "Not recorded"
              : formatBdt(account.outstandingMinor)}
          </strong>
        </article>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <div>
            <strong>Payment action needs attention</strong>
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {success ? (
        <section className={styles.success} aria-live="polite">
          <CheckCircle2 aria-hidden="true" size={24} />
          <div className={styles.successCopy}>
            <span>Payment recorded</span>
            <h2>
              {success.outstandingMinor === 0
                ? "This checkout is now paid in full"
                : "The payment was saved"}
            </h2>
            <p>Payment receipt {success.receiptNumber}</p>
          </div>
          <dl>
            <div>
              <dt>Received</dt>
              <dd>{formatBdt(success.amountMinor)}</dd>
            </div>
            <div>
              <dt>Total paid</dt>
              <dd>{formatBdt(success.cumulativePaidMinor)}</dd>
            </div>
            <div>
              <dt>Still due</dt>
              <dd>{formatBdt(success.outstandingMinor)}</dd>
            </div>
          </dl>
          <div className={styles.successActions}>
            {canReadReceipt ? (
              <>
                <Link
                  href={`/pos/payment-collections/${success.receiptId}/receipt`}
                >
                  View payment receipt
                </Link>
                <Link
                  href={`/pos/payment-collections/${success.receiptId}/receipt`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Print payment receipt
                </Link>
              </>
            ) : null}
            <button type="button" onClick={() => setSuccess(null)}>
              {success.outstandingMinor > 0
                ? "Collect another payment"
                : "Back to payment details"}
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.workspaceGrid}>
        <div className={styles.historyColumn}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>At checkout</span>
                <h2>Original payment</h2>
              </div>
              <small>
                {account.initialPayments.length} payment
                {account.initialPayments.length === 1 ? "" : "s"}
              </small>
            </header>

            {account.initialPayments.length > 0 ? (
              <div className={styles.paymentList}>
                {account.initialPayments.map((payment, index) => (
                  <article key={`${payment.method}-${index}`}>
                    <div className={styles.methodIcon}>
                      <PaymentMethodIcon method={payment.method} />
                    </div>
                    <div>
                      <strong>{paymentMethodLabel(payment.method)}</strong>
                      <span>
                        {payment.reference
                          ? `Reference ${payment.reference}`
                          : payment.method === "CASH"
                            ? "Cash received"
                            : "Reference not available"}
                      </span>
                    </div>
                    <strong>{formatBdt(payment.amountMinor)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyInline}>
                No payment was received when this sale was completed.
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Later collections</span>
                <h2>Payment history</h2>
              </div>
              <small>
                {account.collections.length} collection
                {account.collections.length === 1 ? "" : "s"}
              </small>
            </header>

            {account.collections.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
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
                          {formatDate(item.createdAt)}
                        </td>
                        <td data-label="Team member">{item.acceptedByName}</td>
                        <td data-label="Amount">
                          <strong>{formatBdt(item.amountMinor)}</strong>
                        </td>
                        <td data-label="Balance after">
                          {formatBdt(item.balanceAfterMinor)}
                        </td>
                        <td data-label="Receipt">
                          {canReadReceipt ? (
                            <Link
                              className={styles.tableLink}
                              href={`/pos/payment-collections/${item.id}/receipt`}
                            >
                              View
                            </Link>
                          ) : (
                            <span className={styles.restricted}>Restricted</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyInline}>
                No later payment has been collected for this checkout.
              </div>
            )}
          </section>
        </div>

        <aside className={styles.collectionColumn}>
          {!account.legacyPaymentRecorded ? (
            <CollectionState
              title="Collection unavailable"
              text="This older sale does not have recorded payment history, so a later collection cannot be posted safely."
            />
          ) : isPaid ? (
            <CollectionState
              success
              title="Paid in full"
              text="No balance remains on this checkout."
            />
          ) : hasDue && canCollect ? (
            <form
              className={styles.collectionPanel}
              onSubmit={(event) => void submit(event)}
            >
              <header>
                <div>
                  <span>Collect later payment</span>
                  <h2>Record payment</h2>
                  <p>Collect only against the current amount due.</p>
                </div>
                <strong>{formatBdt(outstandingMinor)}</strong>
              </header>

              <div className={styles.collectionSummary}>
                <div>
                  <span>Entered</span>
                  <strong>{formatBdt(enteredMinor)}</strong>
                </div>
                <div>
                  <span>Remaining after</span>
                  <strong>{formatBdt(remainingMinor)}</strong>
                </div>
              </div>

              {uncertain ? (
                <div className={styles.uncertain} role="status">
                  <CircleAlert aria-hidden="true" size={17} />
                  <p>
                    We could not confirm the previous attempt. The payment
                    details are locked so you can retry safely with the same
                    idempotency attempt.
                  </p>
                </div>
              ) : null}

              <div className={styles.paymentLines}>
                {lines.map((line, index) => (
                  <fieldset key={index}>
                    <legend>Payment {index + 1}</legend>
                    <label>
                      Method
                      <select
                        disabled={uncertain || saving}
                        value={line.method}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    method: event.target
                                      .value as PaymentMethodContract,
                                    reference: "",
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
                        disabled={uncertain || saving}
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>

                    {line.method !== "CASH" ? (
                      <label className={styles.referenceField}>
                        Transaction reference
                        <input
                          disabled={uncertain || saving}
                          maxLength={120}
                          value={line.reference}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, reference: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    ) : (
                      <div className={styles.cashNote}>
                        <span>Cash payment</span>
                        <small>No transaction reference is required.</small>
                      </div>
                    )}

                    {lines.length > 1 ? (
                      <button
                        aria-label={`Remove payment ${index + 1}`}
                        className={styles.removeButton}
                        disabled={uncertain || saving}
                        type="button"
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    ) : null}
                  </fieldset>
                ))}
              </div>

              <div className={styles.collectionActions}>
                <button
                  className={styles.addButton}
                  disabled={uncertain || saving || lines.length >= 8}
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      blankLine(takaInput(remainingMinor)),
                    ])
                  }
                  type="button"
                >
                  <Plus aria-hidden="true" size={16} />
                  Add payment method
                </button>

                <button
                  className={styles.primaryButton}
                  disabled={saving || enteredMinor <= 0}
                  type="submit"
                >
                  {saving ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className={styles.spin}
                      size={17}
                    />
                  ) : (
                    <ReceiptText aria-hidden="true" size={17} />
                  )}
                  {saving ? "Recording payment" : "Record payment"}
                </button>
              </div>

              <p className={styles.collectionNote}>
                Overpayment is blocked. Non-cash payments require a transaction
                reference. Up to 8 payment lines can be used for one collection.
              </p>
            </form>
          ) : hasDue ? (
            <CollectionState
              title="Collection access unavailable"
              text="Your role can view this balance but cannot collect payments."
            />
          ) : (
            <CollectionState
              title="Payment history not recorded"
              text="The current balance is unavailable for this checkout."
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function PaymentMethodIcon({ method }: { method: PaymentMethodContract }) {
  switch (method) {
    case "CASH":
      return <Banknote aria-hidden="true" size={17} />;
    case "CARD":
      return <CreditCard aria-hidden="true" size={17} />;
    case "MOBILE_BANKING":
      return <Smartphone aria-hidden="true" size={17} />;
    case "BANK_TRANSFER":
      return <Landmark aria-hidden="true" size={17} />;
  }
}

function CollectionState({
  success = false,
  text,
  title,
}: {
  success?: boolean;
  text: string;
  title: string;
}) {
  const Icon = success ? CheckCircle2 : CircleAlert;
  return (
    <section className={`${styles.collectionState} ${success ? styles.collectionStateSuccess : ""}`}>
      <Icon aria-hidden="true" size={24} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}

function State({
  loading = false,
  text,
  title,
}: {
  loading?: boolean;
  text: string;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : CircleAlert;
  return (
    <main className={styles.statePage}>
      <section className={styles.stateCard}>
        <Icon
          aria-hidden="true"
          className={loading ? styles.spin : undefined}
          size={26}
        />
        <strong>{title}</strong>
        <p>{text}</p>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(reason: unknown) {
  if (!(reason instanceof AdminApiError)) {
    return "We could not confirm the payment result. Retry safely.";
  }

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
