# POS Refund Foundation

## Ownership and history

A refund is an append-only checkout settlement event. It belongs to the checkout because several merchandise returns can create one refund liability and one refund can settle credit from several returns. `PaymentRefund`, ordered `PaymentRefundLine` records, and one `PaymentRefundReceipt` are added without changing the original order, fulfillment, checkout, payment batch, collections, returns, inventory movements, or receipts.

This milestone records a refund that an authorized team member confirms has already been issued. It does not call or confirm a card, mobile-banking, or bank provider. SENVO stores no PAN, CVV, OTP, credentials, provider secrets, or raw provider payloads.

## Settlement

The canonical domain calculator derives:

```text
adjusted payable = original payable - cumulative return credit
gross received = checkout payment + payment collections
cumulative refunded = issued refund events
net received = gross received - cumulative refunded
amount due = max(adjusted payable - net received, 0)
refund due = max(net received - adjusted payable, 0)
```

Positive refund due is `REFUND_DUE`; exact positive adjusted settlement is `PAID`; zero adjusted payable with zero net received is `SETTLED`. Unsafe, negative, over-credit, over-refund, and refunded-above-gross states are rejected.

## Transaction and concurrency

Returns, collections, and refunds use the same organization-scoped `pos_checkout_records` row lock. One outer Prisma transaction locks the checkout, reloads payment history, return credit, and prior refunds, validates the fresh refund due, appends refund/lines/receipt/audit, and commits. There are no nested transactions. A failure rolls all new records back.

Idempotency is unique by organization, checkout, and key. The signature contains sorted normalized refund method, amount, and safe external reference values. An identical retry replays without a duplicate receipt or audit; changed details conflict.

## Methods and security

Supported methods are cash, card, mobile banking, and bank transfer. Split refunds are supported. Non-cash lines require a normalized operational reference and mean only that staff confirmed an external refund was already issued.

The browser supplies checkout ID, idempotency key, and refund lines only. Organization, actor, permissions, payable values, credit, received/refunded totals, timestamps, IDs, and receipt numbers come from trusted context and server records. Creation requires POS and sales read access plus `PAYMENT.CREATE` and `PAYMENT.APPROVE`; receipt reads require receipt, payment, and sales read access.

## API and Admin

The typed routes are `GET/POST /pos/checkouts/:id/refunds` and `GET /pos/refunds/:id/receipt`. Admin checkout details show live gross received, already refunded, net received, and refund due. Explicit confirmation is required before recording. The client keeps one idempotency key for unchanged uncertain retries and uses a new key when details change.

Automated provider refunds, webhooks, approval queues, cancellation/edit/delete, store credit, exchanges, accounting, and cash-drawer reconciliation remain deferred.
