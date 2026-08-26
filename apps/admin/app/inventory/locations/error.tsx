"use client";

import { RefreshCw } from "lucide-react";
import styles from "./_components/stock-locations-workspace.module.css";

export default function StockLocationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel} role="alert">
        <span><RefreshCw size={25} /></span>
        <div>
          <h1>Stock Locations Unavailable</h1>
          <p>{error.message || "The stock location page could not be loaded."}</p>
          <button className={styles.secondaryButton} onClick={reset} type="button">
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      </section>
    </main>
  );
}
