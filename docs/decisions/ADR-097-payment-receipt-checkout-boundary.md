# ADR-097: Payment and Receipt Are Checkout Capabilities with Independent Ownership

## Status

Accepted

## Context

POS checkout must accept manual or externally completed tenders and preserve a historically accurate receipt. Creating payment or receipt records after checkout commits could leave fulfilled inventory and sales without matching financial evidence. Moving the coordination into HTTP, UI, or persistence would also expose trusted facts or duplicate existing sales and inventory rules.

## Decision

The POS application boundary extends the single outer checkout transaction defined by ADR-096. It invokes transaction-scoped payment and receipt repositories after sales fulfillment and before append-only audits and commit. Payment owns the immutable tender batch and ordered payment lines. Receipt owns a separate immutable document snapshot. Sales retains order ownership and inventory retains reservation and ledger ownership.

The server derives payable, paid, outstanding, status, context, identifiers, and receipt number. Outstanding balance is a derived state, not a tender method. Payment payload normalization forms part of checkout idempotency. Receipt rendering and hardware output consume the committed receipt projection outside the transaction.

## Consequences

- Payment or receipt failure rolls back the full sale and inventory consumption.
- Independent payment and receipt models can evolve without putting their rules in POS transport code.
- Historical receipts survive later organization, catalog, staff, and counter edits.
- Legacy checkouts remain honest as `UNRECORDED` rather than receiving fabricated payments.
- Gateway lifecycle, refunds, due collection, cash drawers, and printer adapters require later decisions.
