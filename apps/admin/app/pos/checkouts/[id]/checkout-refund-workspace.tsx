"use client";

import type {
  PaymentMethodContract,
  PaymentRefundAccountContract,
} from "@senvo/contracts";
import {
  CircleAlert,
  CircleCheck,
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
import { formatBdt, parseTaka, takaInput } from "../../sell/_lib/money";
import styles from "./checkout-refund-workspace.module.css";

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
  permissions,
}: {
  checkoutId: string;
  permissions: readonly AdminPermissionKey[];
}) {
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
  const [refreshing, setRefreshing] = useState(false);
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

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!canRead) return;
      mode === "initial" ? setLoading(true) : setRefreshing(true);
      setError(null);
      try {
        const result = await client.getPosRefunds(checkoutId);
        setAccount(result.data);
        if ((result.data.refundableMinor ?? 0) > 0) {
          setLines((current) =>
            current.some((line) => line.amount)
              ? current
              : [blankLine(takaInput(result.data.refundableMinor ?? 0))],
          );
        }
      } catch (reason) {
        setError(messageFor(reason));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [canRead, checkoutId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account?.refundableMinor || saving) return;

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
      setError("Confirm that the money has already been returned to the customer.");
      return;
    }

    const normalized = refunds.map((line) => ({
      amountMinor: line.amountMinor as number,
      method: line.method,
      ...(line.reference ? { reference: line.reference } : {}),
    }));
    const signature = JSON.stringify(normalized);
    if (!attempt.current || attempt.current.signature !== signature) {
      attempt.current = { key: `refund-${crypto.randomUUID()}`, signature };
    }

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
        (result.data.account.refundableMinor ?? 0) > 0
          ? [blankLine(takaInput(result.data.account.refundableMinor ?? 0))]
          : [blankLine()],
      );
    } catch (reason) {
      const uncertainResult =
        !(reason instanceof AdminApiError) ||
        reason.code === "INTEGRATION.NETWORK_FAILURE";
      setUncertain(uncertainResult);
      setError(messageFor(reason));

      if (!uncertainResult) {
        attempt.current = null;
      }

      if (
        reason instanceof AdminApiError &&
        ["BUSINESS_RULE.VIOLATION", "CONCURRENCY.CONFLICT"].includes(
          reason.code,
        )
      ) {
        try {
          const latest = (await client.getPosRefunds(checkoutId)).data;
          setAccount(latest);
          setConfirmed(false);
          setLines(
            (latest.refundableMinor ?? 0) > 0
              ? [blankLine(takaInput(latest.refundableMinor ?? 0))]
              : [blankLine()],
          );
        } catch {
          // Preserve the original actionable refund error.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <section className={styles.section}>
        <State
          title="Refund access unavailable"
          text="Your role does not include refund history access."
        />
      </section>
    );
  }

  if (loading) {
    return (
      <section className={styles.section}>
        <State
          loading
          title="Loading refunds"
          text="Checking the latest refund due and recorded refund history."
        />
      </section>
    );
  }

  if (!account) {
    return (
      <section className={styles.section}>
        <State
          title="Refund information unavailable"
          text={error ?? "This sale could not be loaded."}
        />
      </section>
    );
  }

  const refundableMinor = account.refundableMinor ?? 0;
  const enteredMinor = lines.reduce(
    (sum, line) => sum + (parseTaka(line.amount) ?? 0),
    0,
  );
  const remainingMinor = Math.max(0, refundableMinor - enteredMinor);
  const hasExternalMethod = lines.some((line) => line.method !== "CASH");
  const canAddMethod =
    !uncertain &&
    !saving &&
    lines.length < maxRefundMethodLines &&
    remainingMinor > 0;

  function changeLine(index: number, patch: Partial<RefundDraftLine>) {
    setConfirmed(false);
    setLines((items) => updateRefundMethod(items, index, patch));
  }

  function removeLine(index: number) {
    if (uncertain || saving || lines.length === 1) return;
    setConfirmed(false);
    setLines((items) => items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <section className={styles.section} aria-labelledby="refund-heading">
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.eyebrow}>Customer refund</span>
          <h2 id="refund-heading">Refund money for {account.orderNumber}</h2>
          <p>
            Record money only after it has already been returned to the customer.
            SENVO keeps the refund balance, history and receipt auditable.
          </p>
        </div>
        <button
          className={styles.refreshButton}
          disabled={refreshing || uncertain}
          onClick={() => void load("refresh")}
          type="button"
        >
          <RotateCcw
            aria-hidden="true"
            className={refreshing ? styles.spin : undefined}
            size={16}
          />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <section className={styles.summary} aria-label="Refund balance">
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
        <div className={styles.refundDue}>
          <span>Refund due now</span>
          <strong>{formatBdt(refundableMinor)}</strong>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          <p>{error}</p>
        </div>
      ) : null}

      {uncertain ? (
        <div className={styles.uncertain} role="status">
          <CircleAlert aria-hidden="true" size={18} />
          <p>
            We could not confirm the previous refund attempt. The details are
            locked so you can retry the same idempotent request safely.
          </p>
        </div>
      ) : null}

      {success ? (
        <section className={styles.success} aria-live="polite">
          <div className={styles.successHeader}>
            <div className={styles.successTitle}>
              <CircleCheck aria-hidden="true" size={21} />
              <div>
                <span>Refund recorded</span>
                <strong>{formatBdt(success.amountMinor)} recorded</strong>
                <small>Receipt {success.receiptNumber}</small>
              </div>
            </div>
          </div>
          <div className={styles.successFacts}>
            <div>
              <span>Refund still due</span>
              <strong>{formatBdt(success.refundableMinor)}</strong>
            </div>
            <div>
              <span>Customer still owes</span>
              <strong>{formatBdt(success.outstandingMinor)}</strong>
            </div>
          </div>
          {canReadReceipt ? (
            <div className={styles.successActions}>
              <Link
                className={styles.receiptLink}
                href={`/pos/refunds/${success.id}/receipt`}
              >
                <ReceiptText aria-hidden="true" size={16} />
                View refund receipt
              </Link>
              <Link
                className={styles.receiptLink}
                href={`/pos/refunds/${success.id}/receipt?print=1`}
              >
                Print refund receipt
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.historyPanel}>
          <header className={styles.historyHeader}>
            <div>
              <span>Recorded history</span>
              <h3>Refund history</h3>
              <p>Money-return records already saved against this sale.</p>
            </div>
            <small>
              {account.refunds.length} refund
              {account.refunds.length === 1 ? "" : "s"}
            </small>
          </header>

          {account.refunds.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>Team member</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {account.refunds.map((refund) => (
                    <tr key={refund.id}>
                      <td data-label="Recorded">
                        {formatDate(refund.issuedAt)}
                      </td>
                      <td data-label="Team member">{refund.acceptedByName}</td>
                      <td data-label="Amount">
                        <strong>{formatBdt(refund.amountMinor)}</strong>
                      </td>
                      <td data-label="Receipt">
                        {canReadReceipt ? (
                          <Link
                            className={styles.tableLink}
                            href={`/pos/refunds/${refund.id}/receipt`}
                          >
                            {refund.receiptNumber}
                          </Link>
                        ) : (
                          <span className={styles.restricted}>
                            {refund.receiptNumber}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyInline}>
              No money refunds have been recorded for this sale.
            </div>
          )}
        </section>

        <aside>
          {!account.legacyPaymentRecorded ? (
            <State
              title="Refund unavailable for this older sale"
              text="This sale does not have the detailed payment record required for safe refund tracking."
            />
          ) : refundableMinor <= 0 ? (
            <State
              success
              title="No refund is due"
              text="Recorded money returned matches the current refundable balance."
            />
          ) : !canCreate ? (
            <State
              title="Refund recording unavailable"
              text="Your role can view refund history but cannot record money returned to the customer."
            />
          ) : (
            <form
              className={styles.refundPanel}
              onSubmit={(event) => void submit(event)}
            >
              <header className={styles.refundHeader}>
                <div>
                  <span className={styles.eyebrow}>Record refund</span>
                  <h3>Money returned</h3>
                  <p>Use one method or split the refund across several methods.</p>
                </div>
                <strong>{formatBdt(refundableMinor)}</strong>
              </header>

              <div className={styles.collectionSummary}>
                <div>
                  <span>Being recorded</span>
                  <strong>{formatBdt(enteredMinor)}</strong>
                </div>
                <div>
                  <span>Refund due after</span>
                  <strong>{formatBdt(remainingMinor)}</strong>
                </div>
              </div>

              <div className={styles.paymentLines}>
                {lines.map((line, index) => (
                  <fieldset className={styles.paymentLine} key={index}>
                    <legend>Refund {index + 1}</legend>
                    <label>
                      Method
                      <select
                        disabled={uncertain || saving}
                        value={line.method}
                        onChange={(event) =>
                          changeLine(index, {
                            method: event.target.value as PaymentMethodContract,
                          })
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
                        disabled={uncertain || saving}
                        inputMode="decimal"
                        value={line.amount}
                        onChange={(event) =>
                          changeLine(index, { amount: event.target.value })
                        }
                      />
                    </label>
                    {line.method !== "CASH" ? (
                      <label className={styles.referenceField}>
                        Transaction reference
                        <input
                          disabled={uncertain || saving}
                          placeholder="Required"
                          value={line.reference}
                          onChange={(event) =>
                            changeLine(index, { reference: event.target.value })
                          }
                        />
                      </label>
                    ) : null}
                    {lines.length > 1 ? (
                      <button
                        aria-label={`Remove refund ${index + 1}`}
                        className={styles.iconButton}
                        disabled={uncertain || saving}
                        onClick={() => removeLine(index)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    ) : null}
                  </fieldset>
                ))}
              </div>

              <div className={styles.splitAction}>
                <button
                  className={styles.secondaryButton}
                  disabled={!canAddMethod}
                  onClick={() => {
                    setConfirmed(false);
                    setLines((items) => [
                      ...items,
                      blankLine(takaInput(remainingMinor)),
                    ]);
                  }}
                  title={
                    lines.length >= maxRefundMethodLines
                      ? "A refund can use up to 8 methods."
                      : remainingMinor <= 0
                        ? "Reduce the current amount before adding another method."
                        : undefined
                  }
                  type="button"
                >
                  <Plus aria-hidden="true" size={16} />
                  Add payment method
                </button>
              </div>

              <label className={styles.confirmation}>
                <input
                  checked={confirmed}
                  disabled={uncertain || saving}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {hasExternalMethod
                    ? "I confirm every non-cash refund was already issued outside SENVO, and any cash amount was handed to the customer."
                    : "I confirm this cash has already been handed to the customer."}
                </span>
              </label>

              <p className={styles.helper}>
                SENVO records this money movement and receipt. It does not send a
                card, mobile-banking or bank-transfer refund from this POS screen.
              </p>

              <button
                className={styles.primaryButton}
                disabled={saving}
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
                {uncertain ? "Retry refund safely" : "Record refund"}
              </button>
            </form>
          )}
        </aside>
      </div>
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
  if (!(reason instanceof AdminApiError)) {
    return "We could not confirm the refund result. Retry safely with the same details.";
  }
  const messages: Partial<Record<string, string>> = {
    "AUTHORIZATION.FORBIDDEN": "You do not have access to record this refund.",
    "BUSINESS_RULE.VIOLATION":
      "The refundable balance changed. Review the latest balance before recording a refund.",
    "CONFLICT.IDEMPOTENCY":
      "This refund attempt was already used with different details.",
    "CONCURRENCY.CONFLICT":
      "The sale changed. Review the latest refundable balance before continuing.",
    "INTEGRATION.NETWORK_FAILURE":
      "We could not confirm the refund result. Retry safely with the same details.",
    "VALIDATION.INVALID_INPUT":
      "Review the refund amount, method and transaction reference.",
  };
  return `${messages[reason.code] ?? reason.message} (${reason.requestId})`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function State({
  loading,
  success,
  text,
  title,
}: {
  loading?: boolean;
  success?: boolean;
  text: string;
  title: string;
}) {
  const Icon = loading ? LoaderCircle : success ? CircleCheck : CircleAlert;
  return (
    <section
      className={`${styles.state}${success ? ` ${styles.successState}` : ""}`}
    >
      <Icon
        aria-hidden="true"
        className={loading ? styles.spin : undefined}
        size={20}
      />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </section>
  );
}
