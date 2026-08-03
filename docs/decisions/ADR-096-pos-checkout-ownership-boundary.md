# ADR-096: POS Checkout Owns Cross-Domain Sale Coordination

## Status

Accepted

## Context

A counter sale must create a sales order, reserve and consume inventory, preserve its source, and append audit history atomically. Letting HTTP controllers or the admin UI perform these steps would expose trusted values and permit partial completion.

## Decision

The POS application boundary owns checkout orchestration. It validates the transaction-fresh cart and derives source, actor, totals, and identifiers before invoking the existing sales lifecycle through transaction-scoped repository capabilities. Sales continues to own orders, inventory continues to own allocation and reservation consumption, and audit remains append only.

One outer transaction contains the order, reservation, consumption movement, checkout record, and audit entry. The transaction-scoped sales adapter reuses the current Prisma transaction and does not open nested database transactions.

Idempotency is scoped to organization, session, and key. Completed carts are immutable through normal POS cart commands.

## Consequences

- HTTP and browser clients remain thin and cannot author trusted checkout facts.
- Inventory depletion retains the existing ledger, allocation, and locking guarantees.
- Failures cannot leave an order, reservation, movement, checkout, or audit record partially committed.
- Payment and output hardware can be added as explicit capabilities without moving business coordination into transport code.
