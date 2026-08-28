import { LoaderCircle } from "lucide-react";
import styles from "./_components/stock-locations-workspace.module.css";

export default function StockLocationsLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.statePanel} aria-label="Loading stock locations">
        <span><LoaderCircle className={styles.spin} size={26} /></span>
        <div>
          <h1>Loading Stock Locations</h1>
          <p>Reading the organization-scoped inventory location directory…</p>
        </div>
      </section>
    </main>
  );
}
