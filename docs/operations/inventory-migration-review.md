# Inventory Migration Review

Migration: `202607030001_add_inventory_ledger_foundation`

## Additive Changes

The migration adds:

- `InventoryMovementType` enum
- `InventoryMovementStatus` enum
- composite uniqueness on `stock_locations(id, organization_id)`
- composite uniqueness on `product_variants(id, organization_id)`
- `inventory_movements`
- `inventory_movement_lines`
- inventory ledger indexes

No prior migration is edited. No destructive changes are introduced.

## Constraints Reviewed

Database constraints enforce:

- positive line quantity
- positive line number
- movement source/destination shape
- posted status requires `posted_at`
- draft status requires null `posted_at`
- movement number uniqueness per organization
- idempotency key uniqueness per organization
- one line per variant per movement
- unique line number per movement
- same-organization movement, location, and variant references
- restrictive deletion

## Balance Strategy

No SQL view or balance table is added. The balance query repository uses parameterized SQL aggregation over POSTED movements. This avoids introducing a stored balance table before costing, reservation, and availability semantics are defined.

## Reset and Drift

The migration is expected to deploy, reset, reapply, and produce no drift under the existing PostgreSQL integration pipeline.
