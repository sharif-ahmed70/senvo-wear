"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import styles from "./_components/roles-permissions-workspace.module.css";

export default function RolesError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <CircleAlert aria-hidden="true" size={25} />
        <div>
          <strong>Roles page could not be opened</strong>
          <p>Retry the page without changing the current role configuration.</p>
          <div className={styles.stateAction}>
            <button className={styles.secondaryButton} onClick={reset} type="button">
              <RefreshCw aria-hidden="true" size={16} /> Retry
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
