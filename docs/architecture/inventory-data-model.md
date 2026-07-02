# Inventory Data Model

## InventoryMovement

`InventoryMovement` is an organization-scoped stock movement document.

Key fields:

- `movementNumber`: unique per organization
- `type`: OPENING, RECEIPT, ISSUE, TRANSFER, ADJUSTMENT_IN, or ADJUSTMENT_OUT
- `status`: DRAFT or POSTED
- `sourceLocationId`: required only for outgoing movement shapes
- `destinationLocationId`: required only for incoming movement shapes
- `idempotencyKey`: unique per organization
- `payloadSignature`: internal command signature for idempotency conflict detection
- `occurredAt`: business-effective timestamp
- `postedAt`: set only after posting

Source and destination locations use composite same-organization foreign keys. Source and destination cannot be the same for transfer.

## InventoryMovementLine

`InventoryMovementLine` is an immutable line item for a movement.

Key fields:

- `productVariantId`
- `quantity`
- `lineNumber`
- `note`

Quantity is a positive integer because garments are discrete units in this phase. A variant may appear at most once per movement, and line numbers are unique per movement.

## Balance Derivation

On-hand is derived from POSTED movement lines:

- Incoming: destination side of OPENING, RECEIPT, TRANSFER, ADJUSTMENT_IN
- Outgoing: source side of ISSUE, TRANSFER, ADJUSTMENT_OUT

DRAFT movements are ignored. There is no editable balance table.

## Indexes

Movement indexes support list filters and deterministic ordering:

- `organizationId + status + occurredAt + id`
- `organizationId + type + occurredAt + id`
- `organizationId + sourceLocationId + occurredAt`
- `organizationId + destinationLocationId + occurredAt`

Line indexes support balance aggregation and movement loading:

- `organizationId + productVariantId`
- `movementId`
