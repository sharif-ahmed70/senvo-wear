# Inventory Reservation Migration Review

Migration: `202607030003_add_inventory_reservation_foundation`

Review checklist:

- creates `InventoryReservationStatus` enum
- creates `inventory_reservations`
- creates `inventory_reservation_lines`
- enforces positive line quantity and line number
- enforces positive reservation version
- enforces reference pair consistency
- enforces status timestamp consistency
- enforces same-organization foreign keys
- uses restrictive deletion for reservation history
- adds unique organization-scoped reservation number and idempotency key
- adds indexes for lifecycle lists, stock-location reservation checks, references, and reserved quantity aggregation
- does not create a stored available-to-sell table
- does not modify previous migrations
