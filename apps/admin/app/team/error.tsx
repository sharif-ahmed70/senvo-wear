"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import styles from "./_components/team-workspace.module.css";

export default function TeamError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <CircleAlert aria-hidden="true" size={25} />
        <div>
          <strong>Team page could not be opened</strong>
          <p>Try the route again. Existing team data has not been changed.</p>
          <button className={styles.secondaryButton} onClick={reset} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Try again
          </button>
        </div>
      </section>
    </main>
  );
}
