"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { cartStorageKey, readCart, type CartLine } from "../_lib/cart";
import {
  checkoutAttempt,
  checkoutAttemptStorageKey,
} from "../_lib/checkout-attempt";
import {
  StorefrontApiError,
  storefrontApi,
  taka,
} from "../_lib/storefront-api";
export function CheckoutWorkspace() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setLines(readCart(window.localStorage)),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, []);
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceMinor,
    0,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      lines: lines.map((line) => ({
        productVariantId: line.productVariantId,
        quantity: line.quantity,
      })),
      note: field("note") || undefined,
      paymentPreference: "CASH_ON_DELIVERY",
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
      window.location.assign("/order-success");
    } catch (cause) {
      setError(
        cause instanceof StorefrontApiError &&
          cause.code.includes("BUSINESS_RULE")
          ? "Some items are no longer available in the requested quantity. Your bag is unchanged; review it and try again."
          : "We could not place your order. Your bag is safe; please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  if (lines.length === 0)
    return (
      <main className="empty">
        <h1>There is nothing to check out</h1>
        <Link href="/">Return to shop</Link>
      </main>
    );
  return (
    <main className="checkout-page">
      <section>
        <p className="eyebrow">Secure order review</p>
        <h1>Delivery details</h1>
        {error ? <p className="notice error">{error}</p> : null}
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
          <div className="payment-choice">
            <strong>Cash on delivery</strong>
            <span>
              Pay when your order arrives. No online charge will be made.
            </span>
          </div>
          <button className="primary" disabled={submitting} type="submit">
            {submitting ? "Placing order..." : `Place order - ${taka(total)}`}
          </button>
        </form>
      </section>
    </main>
  );
}
