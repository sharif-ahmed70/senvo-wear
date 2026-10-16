"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import styles from "../_components/barcode-route-state.module.css";

export default function GenerateBarcodesError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <section className={styles.state} role="alert">
      <span className={`${styles.icon} ${styles.iconError}`}>
        <AlertTriangle aria-hidden="true" size={22} />
      </span>
      <h1>Barcode workflow could not open</h1>
      <p>The page failed before the generation workspace was ready.</p>
      <button className={styles.retry} onClick={reset} type="button">
        <RefreshCw aria-hidden="true" size={15} />
        Try again
      </button>
    </section>
  );
}
