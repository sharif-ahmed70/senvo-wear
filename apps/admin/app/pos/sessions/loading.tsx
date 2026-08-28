import { LoaderCircle } from "lucide-react";
import styles from "./_components/sales-sessions-workspace.module.css";

export default function SalesSessionsLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle
          aria-hidden="true"
          className={styles.spin}
          size={25}
        />
        <div>
          <strong>Loading sales sessions</strong>
          <p>Preparing counter and session information.</p>
        </div>
      </section>
    </main>
  );
}
