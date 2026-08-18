# Online Payment Lifecycle

## Checkout

1. Storefront submits customer, delivery, line intent, idempotency key, and payment preference.
2. Server resolves organization and current product, price, and stock facts.
3. One transaction creates and reserves the canonical order.
4. For online payment, SENVO creates a `CREATED` payment attempt from server-owned amount/currency.
5. The SSLCOMMERZ session is requested outside the transaction and its HTTPS redirect is persisted as `SESSION_READY`.
6. Same-key/same-input retries return or recover the attempt. Changed input conflicts. Failed, cancelled, and expired attempts remain historical and may create a new explicit retry attempt.

## Confirmation

An authenticated IPN is validated against SSLCOMMERZ. A transaction then locks the attempt, compares all payment facts, confirms an active reserved order, appends the existing settlement record, writes reconciliation and audit, and marks the notification processed. Replayed delivery returns success without duplicate rows.

Failed/cancelled observations update only payment lifecycle. Amount, currency, reference, or status mismatches create a `MISMATCH` reconciliation and never settle the order.

If success arrives after reservation expiry or cancellation, SENVO records the confirmed money and sets `REFUND_REQUIRED`; it does not confirm inventory or invent availability.

## Refunds and reconciliation

Only authenticated users with `PAYMENT:APPROVE` can reconcile or refund. Reconciliation queries the provider and runs the same comparison/confirmation path. Provider refund initiation is idempotent and restricted to confirmed provider payments with existing business eligibility. Pending refunds are refreshed by provider reference; confirmed outcomes append immutable `PaymentRefund` facts and audit.
