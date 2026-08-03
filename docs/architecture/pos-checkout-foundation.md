# POS Checkout Foundation

## Purpose

POS checkout converts one organization-scoped cart into a fulfilled sales order. It coordinates existing sales order, inventory allocation, reservation consumption, transaction, and audit boundaries; it does not replace them.

## Trusted flow

1. The API accepts only the cart identifier from the route and an idempotency key from the body.
2. Authentication and both `POS.UPDATE` and `SALES.CREATE` authorization are required.
3. The transaction locks the cart and reloads its session, counter, staff membership, variants, active barcodes, current prices, and allocation policy.
4. The server derives `OFFLINE_STORE` or `EVENT_BOOTH`, booth, staff, organization, BDT totals, order number, reservation identifiers, and movement identifiers.
5. The existing sales lifecycle creates a draft order, reserves through allocation, confirms it, and fulfills it by consuming the reservation.
6. A completed checkout record and append-only audit entry are written before the same transaction commits.

Any validation, allocation, stock, persistence, or audit failure rolls back every checkout write. Inventory remains ledger-derived; checkout never updates a balance directly.

## Retry and history

Idempotency is scoped by organization, sales session, and key. A retry with the original key returns the completed checkout. Reusing a completed cart with another key is rejected. Checkout records preserve counter, staff, order, amount, status, and completion time while the sales order retains the durable sales and inventory references.

## Security

The browser cannot provide organization, staff identity, channel, booth, totals, allocation policy, reservation, or inventory movement identifiers. Organization-scoped composite foreign keys and repository filters prevent cross-organization references. Active session, counter, user, membership, variant, barcode, and sellable allocation checks run against transaction-fresh data.

## Future adapters

- Payment can become a pre-commit checkout capability without changing cart ownership.
- Receipt rendering and printing belong after successful checkout and should consume the completed checkout projection.
- The Xprinter XP-T361U should be implemented behind replaceable receipt and label output adapters.
- Keyboard-wedge or camera barcode scanners continue to use the existing barcode lookup boundary; no hardware driver belongs in checkout domain logic.

Discounts, tax, returns, refunds, customer CRM, cash drawers, and printer drivers remain outside this foundation.
