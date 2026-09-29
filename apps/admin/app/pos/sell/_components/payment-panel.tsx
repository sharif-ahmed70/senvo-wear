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
import { formatBdt, parseTaka, takaInput } from "../_lib/money";

export function computeQuickCashAmounts(dueMinor: number): number[] {
  if (dueMinor <= 0) return [];
  const due = Math.round(dueMinor / 100);
  const options = new Set<number>();
  options.add(due);

  const next50 = Math.ceil(due / 50) * 50;
  if (next50 > due) options.add(next50);

  const next100 = Math.ceil(due / 100) * 100;
  if (next100 > due) options.add(next100);

  const notes = [100, 200, 500, 1000, 2000, 5000];
  for (const note of notes) {
    if (note > due && options.size < 5) {
      options.add(note);
    }
  }

  if (due > 1000) {
    const next500 = Math.ceil(due / 500) * 500;
    if (next500 > due) options.add(next500);
    const next1000 = Math.ceil(due / 1000) * 1000;
    if (next1000 > due) options.add(next1000);
  }

  return Array.from(options)
    .sort((a, b) => a - b)
    .slice(0, 5);
}

const paymentMethods: Array<{ label: string; value: PaymentMethodContract }> = [
  { label: "Cash", value: "CASH" },
  { label: "Card", value: "CARD" },
  { label: "bKash / Nagad (MFS)", value: "MOBILE_BANKING" },
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
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [tenderedMap, setTenderedMap] = useState<Record<string, string>>({});
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
    setTenderedMap({});
    setAllowOutstanding(false);
    setErrors({});
  }

  function addPayment() {
    setDrafts((current) => [...current, newDraft(takaInput(remainingMinor))]);
    setErrors({});
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePayments(drafts, totalMinor, allowOutstanding);
    if (!validation.ok) {
      setErrors(validation.errors);
      const form = event.currentTarget;
      setTimeout(() =>
        form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
      );
      return;
    }

    const trimmedPhone = customerPhone.trim();
    if (trimmedPhone && !/^[+0-9() .-]+$/.test(trimmedPhone)) {
      setErrors((current) => ({
        ...current,
        customerPhone:
          "Phone may contain only digits, spaces, +, -, ., and parentheses.",
      }));
      const form = event.currentTarget;
      setTimeout(() =>
        form?.querySelector<HTMLElement>("[name='customerPhone']")?.focus(),
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

    const trimmedName = customerName.trim();
    const trimmedAddress = customerAddress.trim();
    const customer =
      trimmedName || trimmedPhone || trimmedAddress
        ? {
            addressLine1: trimmedAddress || null,
            name: trimmedName || null,
            phone: trimmedPhone || null,
          }
        : undefined;

    onComplete({
      allowOutstanding,
      ...(customer ? { customer } : {}),
      payments: validation.payments,
    });
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
          <div
            className={
              remainingMinor > 0 ? "pos-payment-summary__due" : undefined
            }
          >
            <span>Remaining</span>
            <strong>{formatBdt(remainingMinor)}</strong>
          </div>
        </section>

        <section
          aria-labelledby="customer-info-title"
          className="pos-customer-section"
        >
          <div className="pos-payment-section-heading">
            <div>
              <span>Customer</span>
              <h3 id="customer-info-title">Customer information (Optional)</h3>
            </div>
            <small>
              Attach customer details to receipt, or leave blank for walk-in
              customer.
            </small>
          </div>
          <div className="pos-customer-fields">
            <label>
              Customer name
              <input
                disabled={submitting}
                maxLength={160}
                name="customerName"
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="e.g. Rahim Uddin (Optional)"
                value={customerName}
              />
            </label>
            <label>
              Phone number
              <input
                aria-invalid={Boolean(errors.customerPhone)}
                disabled={submitting}
                maxLength={40}
                name="customerPhone"
                onChange={(event) => {
                  setCustomerPhone(event.target.value);
                  if (errors.customerPhone) {
                    setErrors((current) => {
                      if (!current.customerPhone) return current;
                      const next = { ...current };
                      delete next.customerPhone;
                      return next;
                    });
                  }
                }}
                placeholder="e.g. +8801700000000 (Optional)"
                value={customerPhone}
              />
              {errors.customerPhone ? (
                <small className="pos-field-error">
                  {errors.customerPhone}
                </small>
              ) : null}
            </label>
            <label className="pos-customer-field-full">
              Address
              <input
                disabled={submitting}
                maxLength={240}
                name="customerAddress"
                onChange={(event) => setCustomerAddress(event.target.value)}
                placeholder="e.g. House 12, Road 4, Banani, Dhaka (Optional)"
                value={customerAddress}
              />
            </label>
          </div>
        </section>

        <section
          className="pos-payment-choice"
          aria-labelledby="payment-choice-title"
        >
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

        <section
          className="pos-payment-entry"
          aria-labelledby="payment-entry-title"
        >
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
              const appliedMinor = parseTaka(draft.amount) ?? 0;
              const tenderedStr = tenderedMap[draft.id] ?? "";
              const tenderedMinor = parseTaka(tenderedStr);
              const quickAmounts = computeQuickCashAmounts(appliedMinor);
              const hasTendered =
                tenderedMinor !== null && tenderedStr.trim() !== "";
              const changeDueMinor = hasTendered
                ? tenderedMinor - appliedMinor
                : null;
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
                      {draft.method === "MOBILE_BANKING"
                        ? "bKash / Nagad Transaction ID (TrxID)"
                        : "Transaction reference"}
                      <input
                        aria-invalid={Boolean(errors[`${index}.reference`])}
                        disabled={submitting}
                        maxLength={120}
                        onChange={(event) =>
                          update(draft.id, { reference: event.target.value })
                        }
                        placeholder={
                          draft.method === "MOBILE_BANKING"
                            ? "e.g. BL4A7Q91XZ"
                            : "Transaction / approval reference"
                        }
                        value={draft.reference}
                      />
                      <small>
                        {errors[`${index}.reference`] ??
                          (draft.method === "MOBILE_BANKING"
                            ? "Enter customer's bKash or Nagad TrxID."
                            : "Use only the safe transaction or approval reference.")}
                      </small>
                    </label>
                  ) : (
                    <div className="pos-cash-calculator">
                      <div className="pos-cash-calc-header">
                        <span>Cash change calculator</span>
                        <small>Local calculation</small>
                      </div>
                      <div className="pos-cash-calc-fields">
                        <label>
                          Cash received from customer
                          <input
                            disabled={submitting}
                            inputMode="decimal"
                            onChange={(event) =>
                              setTenderedMap((current) => ({
                                ...current,
                                [draft.id]: event.target.value,
                              }))
                            }
                            placeholder="e.g. 1000"
                            value={tenderedStr}
                          />
                        </label>
                      </div>
                      {quickAmounts.length > 0 ? (
                        <div className="pos-quick-cash-row">
                          <span>Quick cash:</span>
                          <div className="pos-quick-cash-buttons">
                            {quickAmounts.map((amt) => {
                              const isExact = amt * 100 === appliedMinor;
                              return (
                                <button
                                  className="pos-quick-cash-btn"
                                  disabled={submitting}
                                  key={amt}
                                  onClick={() =>
                                    setTenderedMap((current) => ({
                                      ...current,
                                      [draft.id]: amt.toString(),
                                    }))
                                  }
                                  type="button"
                                >
                                  {isExact ? `Exact ৳ ${amt}` : `৳ ${amt}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {changeDueMinor !== null ? (
                        changeDueMinor >= 0 ? (
                          <div className="pos-change-banner" role="status">
                            <span>Change to return (ফেরত):</span>
                            <strong>{formatBdt(changeDueMinor)}</strong>
                          </div>
                        ) : (
                          <div
                            className="pos-change-banner pos-change-banner--short"
                            role="status"
                          >
                            <span>Received less than payment amount:</span>
                            <strong>
                              Short by {formatBdt(Math.abs(changeDueMinor))}
                            </strong>
                          </div>
                        )
                      ) : null}
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
