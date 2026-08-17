"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { taka, type CheckoutResult } from "../_lib/storefront-api";
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
    <main className="success-page">
      <CheckCircle2 />
      <p className="eyebrow">Order received</p>
      <h1>Thank you. We have reserved your pieces.</h1>
      {order ? (
        <>
          <p>
            Order <strong>{order.orderNumber}</strong> -{" "}
            {taka(order.totalMinor)}
          </p>
          <p>
            Payment: <strong>Cash on delivery</strong>
          </p>
        </>
      ) : (
        <p>
          Your order was received. Keep your confirmation details for reference.
        </p>
      )}
      <p>
        Payment will be collected during delivery. Our team will review the
        delivery details before dispatch.
      </p>
      <Link className="primary link-button" href="/">
        Continue shopping
      </Link>
    </main>
  );
}
