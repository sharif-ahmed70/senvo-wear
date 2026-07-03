# Inventory Reservation Requirements

Inventory reservation supports:

- create active reservation
- confirm active reservation
- release active reservation
- expire active reservation
- reserved quantity reads
- available-to-sell reads
- reservation list and by-id reads

Eligibility:

- stock location must be `ACTIVE`
- stock location must be sellable
- product variants must be `ACTIVE`
- all references must belong to the same organization

Lifecycle:

- `ACTIVE -> CONFIRMED`
- `ACTIVE -> RELEASED`
- `ACTIVE -> EXPIRED`

Terminal reservations cannot be reactivated or transitioned again.
