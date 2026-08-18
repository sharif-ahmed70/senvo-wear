"use client";

import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  StorefrontApiError,
  storefrontApi,
  taka,
  type CheckoutResult,
  type PaymentStatusResult,
} from "../_lib/storefront-api";

export function PaymentReturnWorkspace({
  returnState,
}: {
  returnState: "cancel" | "fail" | "status" | "success";
}) {
  const [payment, setPayment] = useState<PaymentStatusResult | null>(null);
  const [publicToken, setPublicToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    try {
      setPayment(await storefrontApi.paymentStatus(token));
    } catch (cause) {
      setError(paymentError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = readLastOrder(window.sessionStorage);
      const token = stored?.payment?.publicToken ?? "";
      setPublicToken(token);
      if (token) void refresh(token);
      else {
        setError(
          "Payment details are not available in this browser. Contact the store with your order number.",
        );
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  async function retry() {
    if (!publicToken || retrying) return;
    setRetrying(true);
    setError("");
    try {
      const keyName = `senvo-payment-retry:${publicToken}`;
      const idempotencyKey =
        window.sessionStorage.getItem(keyName) ??
        `webpay:${crypto.randomUUID()}`;
      window.sessionStorage.setItem(keyName, idempotencyKey);
      const result = await storefrontApi.retryPayment(
        publicToken,
        idempotencyKey,
      );
      setPayment(result);
      if (result.payment.redirectUrl)
        window.location.assign(result.payment.redirectUrl);
    } catch (cause) {
      setError(paymentError(cause));
    } finally {
      setRetrying(false);
    }
  }

  const status = payment?.payment.status;
  const retryAllowed =
    status === "FAILED" || status === "CANCELLED" || status === "EXPIRED";
  return (
    <main className="success-page" aria-live="polite">
      {loading ? (
        <LoaderCircle className="spin" />
      ) : status === "SUCCEEDED" ? (
        <CheckCircle2 />
      ) : (
        <AlertCircle />
      )}
      <p className="eyebrow">Online payment</p>
      <h1>{paymentHeading(status, returnState)}</h1>
      {payment ? (
        <p>
          Order <strong>{payment.orderNumber}</strong> -{" "}
          {taka(payment.amountMinor)}
        </p>
      ) : null}
      <p>{paymentMessage(status, returnState)}</p>
      {payment?.payment.resolutionStatus === "REFUND_REQUIRED" ? (
        <p className="notice error">
          Payment was confirmed after the reservation could no longer be
          fulfilled. Our team must review and refund it.
        </p>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sales-actions">
        {publicToken ? (
          <button
            className="secondary"
            disabled={loading}
            onClick={() => void refresh(publicToken)}
            type="button"
          >
            <RefreshCw size={18} /> Refresh status
          </button>
        ) : null}
        {retryAllowed ? (
          <button
            className="primary"
            disabled={retrying}
            onClick={() => void retry()}
            type="button"
          >
            {retrying ? "Preparing payment..." : "Try payment again"}
          </button>
        ) : null}
      </div>
      <Link href="/">Continue shopping</Link>
    </main>
  );
}

function readLastOrder(storage: Storage): CheckoutResult | null {
  try {
    return JSON.parse(
      storage.getItem("senvo-last-order") ?? "null",
    ) as CheckoutResult | null;
  } catch {
    return null;
  }
}

function paymentHeading(
  status: PaymentStatusResult["payment"]["status"] | undefined,
  returnState: string,
): string {
  if (status === "SUCCEEDED") return "Payment confirmed";
  if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED")
    return "Payment was not completed";
  if (returnState === "success") return "Payment confirmation is pending";
  return "Checking payment status";
}

function paymentMessage(
  status: PaymentStatusResult["payment"]["status"] | undefined,
  returnState: string,
): string {
  if (status === "SUCCEEDED")
    return "The provider-confirmed payment is recorded for your order.";
  if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED")
    return "Your order has not been marked paid. You can safely start another payment attempt.";
  if (returnState === "success")
    return "The payment page returned successfully, but only verified provider confirmation can mark the order paid.";
  return "We are using the server record, not the browser return address, to confirm payment.";
}

function paymentError(cause: unknown): string {
  return cause instanceof StorefrontApiError
    ? `${cause.message} Reference: ${cause.requestId}`
    : "Payment status could not be loaded. Retry without submitting another payment.";
}
