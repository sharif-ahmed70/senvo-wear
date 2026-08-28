import { LoaderCircle } from "lucide-react";
import styles from "./_components/sales-order-detail-workspace.module.css";

export default function SalesOrderDetailLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span>
          <LoaderCircle className={styles.spin} size={28} />
        </span>
        <h1>Loading sales order</h1>
        <p>Preparing the latest order, payment and fulfillment view…</p>
      </section>
    </main>
  );
}
