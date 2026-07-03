# ADR-065: Server-Refreshed Draft Order Snapshots

## Status

Accepted

## Decision

When draft order lines are replaced, catalog snapshots are refreshed by the server from current product, variant, color, and size records.

## Rationale

A draft order is not yet committed to inventory coordination, so replacing its lines should reflect current catalog display data. Client-supplied snapshot text would allow mass assignment and historical rendering tampering.

## Consequences

Snapshot fields remain absent from amendment input contracts. Once the order leaves `DRAFT`, snapshots remain immutable.
