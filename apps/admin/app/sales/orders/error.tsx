"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import styles from "./_components/sales-orders-list-workspace.module.css";

export default function SalesOrdersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel} role="alert">
        <span>
          <AlertCircle size={28} />
        </span>
        <div>
          <h1>Sales Orders could not open</h1>
          <p>
            The route failed before the orders workspace could load. Retry the
            page; no order state was changed.
          </p>
          <button
            className={styles.secondaryButton}
            onClick={reset}
            type="button"
          >
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      </section>
    </main>
  );
}
