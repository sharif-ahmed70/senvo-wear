"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import styles from "./_components/checkout-history-workspace.module.css";

export default function CheckoutHistoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <AlertCircle aria-hidden="true" size={28} />
        <strong>Checkout History could not open</strong>
        <p>Retry this screen. Completed sales remain unchanged.</p>
        <button
          className={styles.secondaryButton}
          onClick={reset}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
          Try again
        </button>
      </section>
    </main>
  );
}
