# Reservation Consumption Migration Review

Migration: `202607030004_add_reservation_consumption_linkage`

Changes:

- Adds nullable `inventory_reservations.consumed_by_movement_id`.
- Adds a check that only `CONFIRMED` reservations may carry a consumption linkage.
- Adds a unique index on `(consumed_by_movement_id, organization_id)` so one movement can consume at most one reservation.
- Adds a composite same-organization foreign key to `inventory_movements(id, organization_id)`.
- Uses `ON DELETE RESTRICT` and `ON UPDATE CASCADE`.

No existing migration is edited. No UUID database default is added. No generated, environment, or secret file is required.

Rules still enforced in application code:

- Linkage immutability after consumption.
- Active status, expected version, expiry, location, variant, and physical stock checks.
- Advisory lock ordering before stock recomputation.
