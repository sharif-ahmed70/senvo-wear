import { LoaderCircle } from "lucide-react";
import styles from "./_components/team-workspace.module.css";

export default function TeamLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
        <div>
          <strong>Loading team</strong>
          <p>Getting current team members, roles and access status.</p>
        </div>
      </section>
    </main>
  );
}
