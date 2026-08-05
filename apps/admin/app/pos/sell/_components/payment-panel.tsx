"use client";

import { CreditCard, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type {
  CheckoutPosCartServiceInputContract,
  PaymentMethodContract,
} from "@senvo/contracts";
import {
  paymentTotal,
  remainingPayment,
  validatePayments,
  type PaymentDraft,
} from "../_lib/checkout-attempt";
import { formatBdt, takaInput } from "../_lib/money";

const paymentMethods: Array<{ label: string; value: PaymentMethodContract }> = [
  { label: "Cash", value: "CASH" },
  { label: "Card", value: "CARD" },
  { label: "Mobile banking", value: "MOBILE_BANKING" },
  { label: "Bank transfer", value: "BANK_TRANSFER" },
];

function newDraft(amount = ""): PaymentDraft {
  return { amount, id: crypto.randomUUID(), method: "CASH", reference: "" };
}

export function PaymentPanel({
  canApproveDue,
  onCancel,
  onComplete,
  submitting,
  totalMinor,
}: {
  canApproveDue: boolean;
  onCancel: () => void;
  onComplete: (
    payload: Omit<
      CheckoutPosCartServiceInputContract,
      "cartId" | "idempotencyKey"
    >,
  ) => void;
  submitting: boolean;
  totalMinor: number;
}) {
  const [drafts, setDrafts] = useState<PaymentDraft[]>([
    newDraft(takaInput(totalMinor)),
  ]);
  const [allowOutstanding, setAllowOutstanding] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const enteredMinor = useMemo(() => paymentTotal(drafts), [drafts]);
  const remainingMinor = remainingPayment(totalMinor, enteredMinor);

  function update(id: string, patch: Partial<PaymentDraft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
    setErrors({});
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePayments(drafts, totalMinor, allowOutstanding);
    if (!validation.ok) {
      setErrors(validation.errors);
      setTimeout(() =>
        event.currentTarget
          .querySelector<HTMLElement>("[aria-invalid='true']")
          ?.focus(),
      );
      return;
    }
    if (
      validation.remainingMinor > 0 &&
      !window.confirm(
        `${formatBdt(validation.remainingMinor)} will remain due after this sale. Complete the sale?`,
      )
    )
      return;
    onComplete({ allowOutstanding, payments: validation.payments });
  }

  return (
    <section aria-labelledby="payment-title" className="pos-payment-panel">
      <header>
        <div>
          <span>Take payment</span>
          <h2 id="payment-title">Complete this sale</h2>
        </div>
        <button
          aria-label="Return to order"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          <X size={20} />
        </button>
      </header>
      <form onSubmit={submit}>
        <div className="pos-payment-summary">
          <div>
            <span>Order total</span>
            <strong>{formatBdt(totalMinor)}</strong>
          </div>
          <div>
            <span>Entered payment</span>
            <strong>{formatBdt(enteredMinor)}</strong>
          </div>
          <div>
            <span>Remaining amount</span>
            <strong>{formatBdt(remainingMinor)}</strong>
          </div>
        </div>
        <button
          className="pos-sale-secondary"
          disabled={submitting}
          onClick={() => {
            setDrafts([newDraft(takaInput(totalMinor))]);
            setAllowOutstanding(false);
            setErrors({});
          }}
          type="button"
        >
          Pay full amount
        </button>
        <div className="pos-payment-lines">
          {drafts.map((draft, index) => {
            const needsReference = draft.method !== "CASH";
            return (
              <fieldset key={draft.id}>
                <legend>Payment {index + 1}</legend>
                <label>
                  Payment method
                  <select
                    disabled={submitting}
                    onChange={(event) =>
                      update(draft.id, {
                        method: event.target.value as PaymentMethodContract,
                        reference: "",
                      })
                    }
                    value={draft.method}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    aria-invalid={Boolean(errors[`${index}.amount`])}
                    disabled={submitting}
                    inputMode="decimal"
                    onChange={(event) =>
                      update(draft.id, { amount: event.target.value })
                    }
                    placeholder="0.00"
                    value={draft.amount}
                  />
                  {errors[`${index}.amount`] ? (
                    <small className="pos-field-error">
                      {errors[`${index}.amount`]}
                    </small>
                  ) : null}
                </label>
                {needsReference ? (
                  <label>
                    Transaction reference
                    <input
                      aria-invalid={Boolean(errors[`${index}.reference`])}
                      disabled={submitting}
                      maxLength={120}
                      onChange={(event) =>
                        update(draft.id, { reference: event.target.value })
                      }
                      value={draft.reference}
                    />
                    <small>
                      {errors[`${index}.reference`] ??
                        "Enter only the safe transaction or approval reference."}
                    </small>
                  </label>
                ) : null}
                {drafts.length > 1 ? (
                  <button
                    aria-label={`Remove payment ${index + 1}`}
                    className="pos-remove"
                    disabled={submitting}
                    onClick={() =>
                      setDrafts((current) =>
                        current.filter((item) => item.id !== draft.id),
                      )
                    }
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </fieldset>
            );
          })}
        </div>
        {drafts.length < 8 ? (
          <button
            className="pos-sale-secondary"
            disabled={submitting}
            onClick={() =>
              setDrafts((current) => [
                ...current,
                newDraft(takaInput(remainingMinor)),
              ])
            }
            type="button"
          >
            <Plus size={17} /> Add another payment method
          </button>
        ) : null}
        {canApproveDue ? (
          <div className="pos-due-option">
            <label>
              <input
                checked={allowOutstanding}
                disabled={submitting}
                onChange={(event) => setAllowOutstanding(event.target.checked)}
                type="checkbox"
              />
              Allow remaining balance
            </label>
            {allowOutstanding ? (
              <>
                <p>{formatBdt(remainingMinor)} will remain due.</p>
                <button
                  className="pos-sale-text"
                  onClick={() => setDrafts([])}
                  type="button"
                >
                  Record full amount due
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {errors.payments ? (
          <p className="pos-form-error" role="alert">
            {errors.payments}
          </p>
        ) : null}
        <button
          className="pos-complete-button"
          disabled={submitting}
          type="submit"
        >
          <CreditCard size={19} />
          {submitting ? "Completing sale..." : "Complete sale"}
        </button>
      </form>
    </section>
  );
}
