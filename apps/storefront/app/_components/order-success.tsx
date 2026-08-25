"use client";
import { CheckCircle2, Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  taka,
  type CheckoutResult,
  type PaymentState,
} from "../_lib/storefront-api";
export function OrderSuccess() {
  const [order, setOrder] = useState<CheckoutResult | null>(null);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setOrder(
          JSON.parse(
            window.sessionStorage.getItem("senvo-last-order") ?? "null",
          ) as CheckoutResult | null,
        );
      } catch {
        setOrder(null);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  return (
    <main className="success-page premium-state-page">
      {order?.paymentPreference === "ONLINE_PAYMENT" ? (
        <Clock3 />
      ) : (
        <CheckCircle2 />
      )}
      <p className="eyebrow">Order received</p>
      <h1>Thank you. We have reserved your pieces.</h1>
      {order ? (
        <>
          <p>
            Order <strong>{order.orderNumber}</strong> -{" "}
            {taka(order.totalMinor)}
          </p>
          <p>
            Payment:{" "}
            <strong>
              {order.paymentPreference === "ONLINE_PAYMENT"
                ? paymentStatusLabel(order.payment?.status)
                : "Cash on delivery"}
            </strong>
          </p>
        </>
      ) : (
        <p>
          Your order was received. Keep your confirmation details for reference.
        </p>
      )}
      <p>
        {order?.paymentPreference === "ONLINE_PAYMENT"
          ? "We will confirm payment from the provider before processing the order."
          : "Payment will be collected during delivery. Our team will review the delivery details before dispatch."}
      </p>
      {order?.payment ? (
        <Link className="secondary link-button" href="/payment-return/status">
          Check payment status
        </Link>
      ) : null}
      <Link className="primary link-button" href="/">
        Continue shopping
      </Link>
    </main>
  );
}

function paymentStatusLabel(
  status: PaymentState["status"] | undefined,
): string {
  return status === "SUCCEEDED" ? "Confirmed" : "Confirmation pending";
}
