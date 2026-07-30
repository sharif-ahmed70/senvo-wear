# ADR-090: Inventory Read Model Boundary

- Status: Accepted
- Date: 2026-07-30

## Context

Admin users need inventory overview, location, movement-history, and
variant-availability views. Existing ledger and reservation repositories
already preserve write invariants, but their entities do not include the
catalog and location display data needed by an admin read experience.

Persisting a balance table would create another source of truth and require
transactional synchronization with movement posting, reversal, reservation,
and consumption.

## Decision

Introduce an `InventoryReadRepository` contract and an infrastructure
implementation that returns organization-scoped read projections.

The implementation:

- derives on-hand from posted inventory movement lines
- derives reserved quantity from active reservation lines
- calculates available to sell as `onHand - reserved`
- joins product, variant, color, size, location, and branch display data
- applies stable cursor ordering
- returns `null` for variants outside the trusted organization

The application query service validates inputs and enforces `INVENTORY.READ`.
Strict API contracts reject client-supplied organization identifiers and
internal fields.

## Consequences

- The inventory ledger remains the sole source of physical stock truth.
- Availability cannot drift from a persisted balance table because no such
  table exists.
- Read queries are more complex and require suitable existing indexes.
- Future performance work may use replaceable read optimization, but it must
  preserve ledger semantics and organization isolation.
- Inventory posting and reservation write logic remains unchanged.
