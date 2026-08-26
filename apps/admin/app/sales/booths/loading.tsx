import { LoaderCircle } from "lucide-react";
import styles from "./_components/booth-history-workspace.module.css";

export default function BoothHistoryLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel}>
        <LoaderCircle className={styles.spin} size={28} />
        <div>
          <h1>Loading booth history</h1>
          <p>Preparing event booth records…</p>
        </div>
      </section>
    </main>
  );
}
