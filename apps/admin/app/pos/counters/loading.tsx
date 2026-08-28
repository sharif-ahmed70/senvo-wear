import { LoaderCircle } from "lucide-react";
import styles from "./_components/sales-counters-workspace.module.css";

export default function SalesCountersLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
        <div>
          <strong>Loading sales counters</strong>
          <p>Preparing counter and current-session information.</p>
        </div>
      </section>
    </main>
  );
}
