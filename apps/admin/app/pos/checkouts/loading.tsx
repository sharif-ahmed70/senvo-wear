import { LoaderCircle } from "lucide-react";
import styles from "./_components/checkout-history-workspace.module.css";

export default function CheckoutHistoryLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={28} />
        <strong>Loading checkout history</strong>
        <p>Getting completed counter and booth sales.</p>
      </section>
    </main>
  );
}
