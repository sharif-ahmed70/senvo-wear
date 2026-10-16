"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import styles from "./_components/booth-history-workspace.module.css";

export default function BoothHistoryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel} role="alert">
        <AlertCircle size={28} />
        <div>
          <h1>Booth history could not be opened</h1>
          <p>Retry the page. Existing booth records have not been changed.</p>
          <button
            className={styles.secondaryButton}
            onClick={reset}
            type="button"
          >
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      </section>
    </main>
  );
}
