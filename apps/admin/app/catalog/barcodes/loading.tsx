import { Barcode, LoaderCircle } from "lucide-react";
import styles from "./_components/barcode-route-state.module.css";

export default function BarcodeLoading() {
  return (
    <section className={styles.state} aria-live="polite" aria-busy="true">
      <span className={styles.icon} aria-hidden="true">
        <Barcode size={21} strokeWidth={1.8} />
      </span>
      <LoaderCircle
        aria-hidden="true"
        className={styles.spinner}
        size={20}
        strokeWidth={1.8}
      />
      <h2>Preparing barcode workspace</h2>
      <p>Loading catalog products, variants and identification data.</p>
    </section>
  );
}
