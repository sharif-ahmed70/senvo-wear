import { LoaderCircle } from "lucide-react";
import styles from "./_components/organization-profile-workspace.module.css";

export default function OrganizationLoading() {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <LoaderCircle aria-hidden="true" className={styles.spin} size={25} />
        <div>
          <strong>Loading organization profile</strong>
          <p>Preparing the business identity and contact details.</p>
        </div>
      </section>
    </main>
  );
}
