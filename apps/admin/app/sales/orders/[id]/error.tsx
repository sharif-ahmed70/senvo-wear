"use client";

import { AlertCircle } from "lucide-react";
import styles from "./_components/sales-order-detail-workspace.module.css";

export default function SalesOrderDetailError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel} role="alert">
        <span>
          <AlertCircle size={28} />
        </span>
        <h1>Sales order could not be opened</h1>
        <p>
          The page hit an unexpected rendering error. Retry without changing the
          order state.
        </p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
