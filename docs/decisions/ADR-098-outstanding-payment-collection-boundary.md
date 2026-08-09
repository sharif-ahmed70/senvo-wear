# ADR-098: Outstanding Payment Collection Boundary

## Status

Accepted

## Context

A completed POS sale can remain unpaid. Editing its original financial records would erase history, while independent later writes could over-collect or split payment, receipt, and audit consistency.

## Decision

Represent later payments as append-only `PaymentCollection` records with append-only lines and separate immutable `PaymentCollectionReceipt` snapshots. Derive current balance from the opening batch and collections. Serialize writes by locking the checkout row within the existing application transaction. Use checkout-scoped idempotency keys and normalized request signatures.

Collector and organization ownership come only from trusted application context. Collection requires `PAYMENT.CREATE`, not `PAYMENT.APPROVE`.

## Consequences

- Original checkout payment and sales receipt facts never change.
- Collection, receipt, and audit commit or roll back together.
- Concurrent over-collection and response-loss duplication are prevented.
- Legacy checkouts without an opening batch are readable but not collectible.
- Refunds, reversals, voids, customer credit, and accounting ledger behavior remain future work.
