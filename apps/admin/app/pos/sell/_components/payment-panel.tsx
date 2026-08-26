"use client";

import {
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
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

function newDraft(
  amount = "",
  method: PaymentMethodContract = "CASH",
): PaymentDraft {
  return { amount, id: crypto.randomUUID(), method, reference: "" };
}

function PaymentMethodIcon({ method }: { method: PaymentMethodContract }) {
  switch (method) {
    case "CASH":
      return <Banknote aria-hidden="true" size={18} />;
    case "CARD":
      return <CreditCard aria-hidden="true" size={18} />;
    case "MOBILE_BANKING":
      return <Smartphone aria-hidden="true" size={18} />;
    case "BANK_TRANSFER":
      return <Landmark aria-hidden="true" size={18} />;
  }
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

  function chooseFullPayment(method: PaymentMethodContract) {
    setDrafts([newDraft(takaInput(totalMinor), method)]);
    setAllowOutstanding(false);
    setErrors({});
  }

  function addPayment() {
    setDrafts((current) => [
      ...current,
      newDraft(takaInput(remainingMinor)),
    ]);
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
      <header className="pos-payment-header">
        <div>
          <span>Take payment</span>
          <h2 id="payment-title">Complete this sale</h2>
          <p>Record the payment received at this counter.</p>
        </div>
        <button
          aria-label="Return to order"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      <form onSubmit={submit}>
        <section aria-label="Payment balance" className="pos-payment-summary">
          <div>
            <span>Order total</span>
            <strong>{formatBdt(totalMinor)}</strong>
          </div>
          <div>
            <span>Payment entered</span>
            <strong>{formatBdt(enteredMinor)}</strong>
          </div>
          <div className={remainingMinor > 0 ? "pos-payment-summary__due" : undefined}>
            <span>Remaining</span>
            <strong>{formatBdt(remainingMinor)}</strong>
          </div>
        </section>

        <section className="pos-payment-choice" aria-labelledby="payment-choice-title">
          <div className="pos-payment-section-heading">
            <div>
              <span>Quick payment</span>
              <h3 id="payment-choice-title">Pay the full amount</h3>
            </div>
            <small>Choose one method, or split the payment below.</small>
          </div>
          <div className="pos-payment-methods">
            {paymentMethods.map((method) => (
              <button
                className="pos-payment-method"
                disabled={submitting}
                key={method.value}
                onClick={() => chooseFullPayment(method.value)}
                type="button"
              >
                <PaymentMethodIcon method={method.value} />
                <span>{method.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pos-payment-entry" aria-labelledby="payment-entry-title">
          <div className="pos-payment-section-heading">
            <div>
              <span>Payment breakdown</span>
              <h3 id="payment-entry-title">
                {drafts.length > 1 ? "Split payment" : "Payment details"}
              </h3>
            </div>
            <small>Up to 8 payment lines are supported.</small>
          </div>

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
                        placeholder="Transaction / approval reference"
                        value={draft.reference}
                      />
                      <small>
                        {errors[`${index}.reference`] ??
                          "Use only the safe transaction or approval reference."}
                      </small>
                    </label>
                  ) : (
                    <div className="pos-payment-cash-note">
                      <span>Cash payment</span>
                      <small>No transaction reference is required.</small>
                    </div>
                  )}
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
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  ) : null}
                </fieldset>
              );
            })}
          </div>

          <div className="pos-payment-entry-actions">
            {drafts.length < 8 ? (
              <button
                className="pos-sale-secondary"
                disabled={submitting}
                onClick={addPayment}
                type="button"
              >
                <Plus aria-hidden="true" size={17} />
                Add payment method
              </button>
            ) : null}
            <button
              className="pos-sale-text"
              disabled={submitting}
              onClick={() => chooseFullPayment("CASH")}
              type="button"
            >
              Reset to full cash payment
            </button>
          </div>
        </section>

        {canApproveDue ? (
          <section className="pos-due-option" aria-labelledby="pos-due-title">
            <label id="pos-due-title">
              <input
                checked={allowOutstanding}
                disabled={submitting}
                onChange={(event) => setAllowOutstanding(event.target.checked)}
                type="checkbox"
              />
              Allow a remaining balance
            </label>
            <p>
              Use this only when your role is allowed to approve payment that
              will be collected later.
            </p>
            {allowOutstanding ? (
              <div className="pos-due-option__details">
                <strong>{formatBdt(remainingMinor)} will remain due</strong>
                <button
                  className="pos-sale-text"
                  disabled={submitting}
                  onClick={() => {
                    setDrafts([]);
                    setErrors({});
                  }}
                  type="button"
                >
                  Record the full amount as due
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {errors.payments ? (
          <p className="pos-form-error" role="alert">
            {errors.payments}
          </p>
        ) : null}

        <footer className="pos-payment-actions">
          <button
            className="pos-sale-secondary"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Back to order
          </button>
          <div>
            <span>
              {remainingMinor > 0
                ? `${formatBdt(remainingMinor)} remaining`
                : "Payment covers the full sale"}
            </span>
            <button
              className="pos-complete-button"
              disabled={submitting}
              type="submit"
            >
              <CreditCard aria-hidden="true" size={19} />
              {submitting ? "Completing sale..." : "Complete sale"}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
