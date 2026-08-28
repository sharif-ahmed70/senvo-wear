"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import styles from "./_components/sales-counters-workspace.module.css";

export default function SalesCountersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <CircleAlert aria-hidden="true" size={25} />
        <div>
          <strong>Sales counters could not be opened</strong>
          <p>Retry this page. Existing counters and sessions are unchanged.</p>
          <button className={styles.secondaryButton} onClick={reset} type="button">
            <RefreshCw aria-hidden="true" size={16} /> Retry
          </button>
        </div>
      </section>
    </main>
  );
}
