import { LoaderCircle } from "lucide-react";
import styles from "./_components/sales-orders-list-workspace.module.css";

export default function SalesOrdersLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <span><LoaderCircle className={styles.spin} size={28} /></span>
        <div>
          <h1>Loading sales orders</h1>
          <p>Preparing the latest order workspace.</p>
        </div>
      </section>
    </main>
  );
}
