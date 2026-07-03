# Inventory Reversal Foundation

Posted inventory movements are corrected by appending a compensating posted movement. The original movement is never edited, deleted, voided, or moved to a mutable reversed status.

## Model

`inventory_movements.reverses_movement_id` links a reversal to the original posted movement in the same organization. A unique organization-scoped constraint allows at most one direct reversal for an original movement. `reversal_reason` is required when `reverses_movement_id` is present.

Read models expose:

- `isReversal`: true when the movement reverses another movement.
- `isReversed`: true when another movement directly reverses this movement.
- `reversesMovementId`: the original movement ID for a reversal.
- `reversedByMovementId`: the reversal movement ID for an original.
- `reversalReason`: immutable reason captured on the reversal movement.

## Enforcement

PostgreSQL enforces same-organization self-reference, one direct reversal per original, no self-reference, reason/link consistency, and restrictive deletion. Application code enforces posted-only reversal, no reversal-of-reversal, server-derived compensating payload, idempotency intent matching, active organization/location/variant eligibility, and negative-stock protection.

## Balance

Balances remain derived from posted ledger lines. Reversal lines use the same positive quantities as the original and rely on the normal source/destination aggregation rules to compensate the original effect.
