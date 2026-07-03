# Inventory Reversal Migration Review

Migration: `202607030002_add_inventory_reversal_foundation`

## Additive Changes

- Adds `inventory_movements.reverses_movement_id`.
- Adds `inventory_movements.reversal_reason`.
- Adds same-organization self-referencing foreign key.
- Adds organization-scoped unique index on `reverses_movement_id`.
- Adds lookup index for reversal reads.
- Adds check constraints for reason/link consistency and no self-reference.

## Safety Notes

- No existing columns are dropped or rewritten.
- No existing enum values are changed.
- No previous migration is edited.
- UUID defaults are not added; IDs remain Prisma client generated.
- Deletion remains restrictive through the self-reference and movement-line references.

## Verification

Required CI verification includes migration deploy/status, PostgreSQL integration tests before and after reset, reset/reapply, and drift detection.
