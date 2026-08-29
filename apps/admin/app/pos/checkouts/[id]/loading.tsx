import styles from "./checkout-payment-workspace.module.css";

export default function CheckoutDetailLoading() {
  return (
    <main
      className={styles.statePage}
      aria-busy="true"
      aria-label="Loading checkout payment details"
    >
      <section className={styles.stateCard}>
        <div className={styles.spin} aria-hidden="true">
          ◌
        </div>
        <strong>Loading payment details</strong>
        <p>Getting the latest checkout balance and payment history.</p>
      </section>
    </main>
  );
}
