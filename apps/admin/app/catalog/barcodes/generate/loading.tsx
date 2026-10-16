import { Barcode, LoaderCircle } from "lucide-react";
import styles from "../_components/barcode-route-state.module.css";

export default function GenerateBarcodesLoading() {
  return (
    <section className={styles.state} aria-live="polite">
      <span className={styles.icon}>
        <Barcode aria-hidden="true" size={22} />
      </span>
      <LoaderCircle aria-hidden="true" className={styles.spin} size={18} />
      <h1>Preparing barcode workflow</h1>
      <p>Loading products, variants and existing barcode assignments…</p>
    </section>
  );
}
