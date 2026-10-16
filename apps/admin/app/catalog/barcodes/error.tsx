"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "./_components/barcode-route-state.module.css";

export default function BarcodeError({ reset }: { reset: () => void }) {
  return (
    <section className={styles.state} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <AlertTriangle size={21} strokeWidth={1.8} />
      </span>
      <h1>Barcode workspace could not be opened</h1>
      <p>
        Your catalog data was not changed. Retry the page; if the problem
        continues, use the request error shown inside the workspace for support.
      </p>
      <button className={styles.retry} onClick={reset} type="button">
        <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
        Try again
      </button>
    </section>
  );
}
