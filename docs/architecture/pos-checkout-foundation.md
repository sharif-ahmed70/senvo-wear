# POS Checkout Foundation

## Purpose

POS checkout converts one organization-scoped cart into a fulfilled sales order. It coordinates existing sales order, inventory allocation, reservation consumption, transaction, and audit boundaries; it does not replace them.

## Trusted flow

1. The API accepts the cart identifier from the route plus an idempotency key, ordered payment instructions, and `allowOutstanding` from the body.
2. Authentication and `POS.UPDATE`, `SALES.CREATE`, and `PAYMENT.CREATE` authorization are required. An outstanding sale also requires `PAYMENT.APPROVE`.
3. The transaction locks the cart and reloads its session, counter, staff membership, variants, active barcodes, current prices, and allocation policy.
4. The server derives `OFFLINE_STORE` or `EVENT_BOOTH`, booth, staff, organization, BDT totals, order number, reservation identifiers, and movement identifiers.
5. The existing sales lifecycle creates a draft order, reserves through allocation, confirms it, and fulfills it by consuming the reservation.
6. The transaction persists the completed checkout, immutable payment batch and lines, and immutable receipt snapshot.
7. Checkout, payment, and receipt audit entries are appended before the same transaction commits.

Any validation, allocation, stock, persistence, or audit failure rolls back every checkout write. Inventory remains ledger-derived; checkout never updates a balance directly.

## Retry and history

Idempotency is scoped by organization, sales session, and key and is sensitive to normalized ordered payment instructions and `allowOutstanding`. An identical retry returns the completed checkout without duplicate payment, receipt, or audit records. Changed payment content with the same key and another key on a completed cart are rejected. Legacy checkouts without a payment signature report `UNRECORDED` and cannot be mutated through retry behavior.

## Security

The browser cannot provide organization, staff identity, channel, booth, totals, allocation policy, reservation, or inventory movement identifiers. Organization-scoped composite foreign keys and repository filters prevent cross-organization references. Active session, counter, user, membership, variant, barcode, and sellable allocation checks run against transaction-fresh data.

## Future adapters

- Gateway payment lifecycles can extend payment ownership without changing cart ownership.
- Receipt rendering and printing consume the committed printer-independent receipt projection.
- The Xprinter XP-T361U should be implemented behind replaceable receipt and label output adapters.
- Keyboard-wedge or camera barcode scanners continue to use the existing barcode lookup boundary; no hardware driver belongs in checkout domain logic.

Discounts, tax, returns, refunds, customer CRM, cash drawers, and printer drivers remain outside this foundation.

## Guided selling adapter

The Admin `New Sale` route consumes these boundaries without duplicating checkout logic. Sales sessions retain server ownership of carts. A minimal organization-scoped cart read projection restores unfinished work after refresh, while all mutations and final totals remain server validated. See `docs/architecture/pos-guided-selling-ui.md` for the cashier workflow, payment entry, and retry behavior.
