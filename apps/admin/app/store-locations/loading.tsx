import { LoaderCircle } from "lucide-react";
import styles from "./_components/store-locations-workspace.module.css";

export default function StoreLocationsLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
        <div>
          <strong>Loading store locations</strong>
          <p>Preparing your current store directory.</p>
        </div>
      </section>
    </main>
  );
}
