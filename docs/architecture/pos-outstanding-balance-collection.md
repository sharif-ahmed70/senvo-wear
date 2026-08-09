# POS Outstanding Balance Collection

Collection validation uses the return-adjusted payable. Returns and collections serialize on the same checkout-row lock, so a collection cannot exceed the amount legally due at its transaction order.

## Purpose

Completed POS orders may carry an unpaid balance. A later collection is a new financial fact; it does not rewrite the checkout-time `PaymentBatch` or `SalesReceipt`.

## Transaction and concurrency

`POST /pos/checkouts/:id/payment-collections` uses the existing outer application transaction. The transaction-scoped repository locks the organization-scoped checkout row with `FOR UPDATE`, reloads the opening payment and prior collections, derives the current balance, appends the collection and lines, appends its receipt snapshot, and writes one audit entry. Any failure rolls everything back; repositories open no hidden or nested transaction.

The checkout row is the stable payment-account serialization point. It prevents concurrent requests from spending the same outstanding balance. Database checks preserve the balance equation and tenant-safe foreign keys prevent cross-organization references.

## Idempotency and reads

The unique key is `(organization_id, checkout_id, idempotency_key)`. The same normalized payment signature replays the existing collection without another receipt or audit entry; different instructions conflict. The Admin client retains the key after uncertain failure and rotates it only after confirmed success.

Current paid and due amounts are derived from the immutable opening batch plus all immutable collections. Legacy checkouts without an opening batch remain `UNRECORDED` and cannot accept collections.

## Security and receipts

The request accepts only checkout ID, idempotency key, and payment instructions. Organization and collector identity come from trusted context. Collection requires `POS.READ` and `PAYMENT.CREATE`; reads use `PAYMENT.READ` and, for receipts, `RECEIPT.READ`. `PAYMENT.APPROVE` is not required.

The original sales receipt remains unchanged. Each collection has a separate immutable `PAY-*` receipt with organization, order, collector, method, amount, cumulative paid, and remaining due snapshots. Audit metadata excludes payment references.
