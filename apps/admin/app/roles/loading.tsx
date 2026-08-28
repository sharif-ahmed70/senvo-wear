import { LoaderCircle } from "lucide-react";
import styles from "./_components/roles-permissions-workspace.module.css";

export default function RolesLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
        <div>
          <strong>Loading roles</strong>
          <p>Getting the current workforce roles and permissions.</p>
        </div>
      </section>
    </main>
  );
}
