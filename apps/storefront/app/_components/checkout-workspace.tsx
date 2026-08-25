"use client";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  cartStorageKey,
  canSubmitCheckout,
  checkoutPriceRefreshMessage,
  hydrateStoredCart,
  readCart,
  type HydratedCart,
} from "../_lib/cart";
import {
  checkoutAttempt,
  checkoutAttemptStorageKey,
} from "../_lib/checkout-attempt";
import {
  StorefrontApiError,
  storefrontApi,
  taka,
  type PaymentPreference,
} from "../_lib/storefront-api";
export function CheckoutWorkspace() {
  const [cart, setCart] = useState<HydratedCart>({
    lines: [],
    unavailable: [],
  });
  const [status, setStatus] = useState<
    "empty" | "error" | "loading" | "ready" | "unavailable"
  >("loading");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentPreference[]>([
    "CASH_ON_DELIVERY",
  ]);
  const [paymentPreference, setPaymentPreference] =
    useState<PaymentPreference>("CASH_ON_DELIVERY");
  const load = useCallback(async () => {
    const selections = readCart(window.localStorage);
    if (selections.length === 0) {
      setStatus("empty");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const hydrated = await hydrateStoredCart(window.localStorage, () =>
        storefrontApi.fullCatalog(),
      );
      setCart(hydrated);
      setStatus(hydrated.unavailable.length ? "unavailable" : "ready");
    } catch {
      setCart({ lines: [], unavailable: [] });
      setStatus("error");
    }
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    let active = true;
    void storefrontApi
      .paymentOptions()
      .then((result) => {
        if (active && result.methods.length > 0)
          setPaymentMethods(result.methods);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const total = cart.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceMinor,
    0,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitCheckout(status, cart, submitting)) return;
    setSubmitting(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const field = (name: string): string => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    const checkoutPayload = {
      customer: {
        email: field("email") || undefined,
        name: field("name"),
        phone: field("phone"),
      },
      deliveryAddress: {
        city: field("city"),
        district: field("district"),
        line1: field("line1"),
        line2: field("line2") || undefined,
      },
      lines: cart.lines.map((line) => ({
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        reviewedUnitPriceMinor: line.unitPriceMinor,
      })),
      note: field("note") || undefined,
      paymentPreference,
    };
    const attempt = checkoutAttempt(window.sessionStorage, checkoutPayload);
    try {
      const result = await storefrontApi.checkout({
        ...checkoutPayload,
        idempotencyKey: attempt.idempotencyKey,
      });
      window.sessionStorage.setItem("senvo-last-order", JSON.stringify(result));
      window.sessionStorage.removeItem(checkoutAttemptStorageKey);
      window.localStorage.removeItem(cartStorageKey);
      window.location.assign(result.payment?.redirectUrl ?? "/order-success");
    } catch (cause) {
      if (
        cause instanceof StorefrontApiError &&
        cause.code.includes("BUSINESS_RULE") &&
        cause.message.toLowerCase().includes("price")
      ) {
        setError(
          "Prices changed again before confirmation. Refresh and review the new total.",
        );
        setStatus("error");
      } else if (
        cause instanceof StorefrontApiError &&
        cause.code.includes("BUSINESS_RULE")
      ) {
        setError(
          "Some items are no longer available in the requested quantity. Your bag is unchanged; review it and try again.",
        );
        setStatus("unavailable");
      } else {
        setError(
          "We could not confirm whether your order was placed. Your bag is safe; retry with the same details.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }
  if (status === "loading")
    return (
      <main className="premium-state-page" aria-live="polite">
        <p className="eyebrow">Secure order review</p>
        <h1>Refreshing your order</h1>
        <p>Checking current products, prices, and availability...</p>
      </main>
    );
  if (status === "empty")
    return (
      <main className="premium-state-page">
        <p className="eyebrow">Secure order review</p>
        <h1>There is nothing to check out</h1>
        <Link href="/">Return to shop</Link>
      </main>
    );
  if (status === "error")
    return (
      <main className="premium-state-page" aria-live="polite">
        <p className="eyebrow">Secure order review</p>
        <h1>We could not refresh your order.</h1>
        <p>
          {error ||
            "Retry to check current prices and availability before placing your order."}
        </p>
        <button className="primary" onClick={() => void load()} type="button">
          <RefreshCw size={18} /> Retry
        </button>
        <Link href="/cart">Back to bag</Link>
      </main>
    );
  if (status === "unavailable")
    return (
      <main className="premium-state-page" aria-live="polite">
        <p className="eyebrow">Secure order review</p>
        <h1>Your bag needs attention</h1>
        <p>
          {error ||
            `${cart.unavailable.length} selected item cannot be purchased right now.`}
        </p>
        <button className="primary" onClick={() => void load()} type="button">
          <RefreshCw size={18} /> Retry
        </button>
        <Link href="/cart">Back to bag</Link>
      </main>
    );
  return (
    <main className="checkout-page premium-checkout-page">
      <section>
        <header className="commerce-page-heading compact-heading">
          <p className="eyebrow">Secure order review</p>
          <h1>Delivery details</h1>
          <p>
            Complete your order with current availability and server-verified
            totals.
          </p>
        </header>
        <p className="notice">{checkoutPriceRefreshMessage}</p>
        {error ? <p className="notice error">{error}</p> : null}
        <div className="summary checkout-summary">
          <h2>Order summary</h2>
          {cart.lines.map((line) => (
            <p key={line.productVariantId}>
              <span>
                {line.productName} x {line.quantity}
              </span>
              <strong>{taka(line.unitPriceMinor * line.quantity)}</strong>
            </p>
          ))}
          <p>
            <span>Products / Subtotal</span>
            <strong>{taka(total)}</strong>
          </p>
          <p>
            <span>Delivery</span>
            <strong>{taka(0)}</strong>
          </p>
          <hr />
          <p>
            <span>Total</span>
            <strong>{taka(total)}</strong>
          </p>
          <small>
            Payment:{" "}
            {paymentPreference === "ONLINE_PAYMENT"
              ? "Online payment"
              : "Cash on delivery"}
          </small>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label>
              Full name
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Mobile number
              <input name="phone" placeholder="01XXXXXXXXX" required />
            </label>
            <label>
              Email (optional)
              <input name="email" type="email" />
            </label>
            <label>
              District
              <input name="district" required />
            </label>
            <label>
              City or area
              <input name="city" required />
            </label>
            <label className="wide">
              Delivery address
              <input name="line1" required />
            </label>
            <label className="wide">
              Apartment, floor or landmark (optional)
              <input name="line2" />
            </label>
            <label className="wide">
              Order note (optional)
              <textarea name="note" rows={3} />
            </label>
          </div>
          <fieldset className="payment-choice">
            <legend>Payment</legend>
            {paymentMethods.includes("CASH_ON_DELIVERY") ? (
              <label>
                <input
                  checked={paymentPreference === "CASH_ON_DELIVERY"}
                  name="paymentPreference"
                  onChange={() => setPaymentPreference("CASH_ON_DELIVERY")}
                  type="radio"
                />
                <span>
                  <strong>Cash on delivery</strong>
                  <br />
                  Pay when your order arrives.
                </span>
              </label>
            ) : null}
            {paymentMethods.includes("ONLINE_PAYMENT") ? (
              <label>
                <input
                  checked={paymentPreference === "ONLINE_PAYMENT"}
                  name="paymentPreference"
                  onChange={() => setPaymentPreference("ONLINE_PAYMENT")}
                  type="radio"
                />
                <span>
                  <strong>Online payment</strong>
                  <br />
                  Continue to the secure payment page after placing your order.
                </span>
              </label>
            ) : null}
          </fieldset>
          <button
            className="primary"
            disabled={!canSubmitCheckout(status, cart, submitting)}
            type="submit"
          >
            {submitting
              ? paymentPreference === "ONLINE_PAYMENT"
                ? "Preparing secure payment..."
                : "Placing order..."
              : paymentPreference === "ONLINE_PAYMENT"
                ? `Continue to payment - ${taka(total)}`
                : `Place order - ${taka(total)}`}
          </button>
        </form>
      </section>
    </main>
  );
}
