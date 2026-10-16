"use client";

import { CircleAlert } from "lucide-react";
import styles from "./checkout-payment-workspace.module.css";

export default function CheckoutDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.statePage}>
      <section className={styles.stateCard}>
        <CircleAlert aria-hidden="true" size={26} />
        <strong>Checkout details could not be opened</strong>
        <p>{error.message || "Try loading the checkout again."}</p>
        <button className={styles.receiptButton} type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
