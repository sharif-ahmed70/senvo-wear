"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import styles from "./_components/organization-profile-workspace.module.css";

export default function OrganizationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <CircleAlert aria-hidden="true" size={25} />
        <div>
          <strong>Organization profile could not be opened</strong>
          <p>Retry this page. Existing business details are unchanged.</p>
          <button className={styles.secondaryButton} onClick={reset} type="button">
            <RefreshCw aria-hidden="true" size={16} /> Retry
          </button>
        </div>
      </section>
    </main>
  );
}
