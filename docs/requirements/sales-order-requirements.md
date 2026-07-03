# Sales Order Requirements

- Sales orders must be scoped to one organization.
- Order numbers and idempotency keys must be unique per organization.
- Supported statuses are `DRAFT`, `RESERVED`, `CONFIRMED`, `CANCELLED`, and `FULFILLED`.
- Valid transitions are `DRAFT -> RESERVED`, `DRAFT -> CANCELLED`, `RESERVED -> CONFIRMED`, `RESERVED -> CANCELLED`, `CONFIRMED -> CANCELLED`, and `CONFIRMED -> FULFILLED`.
- Terminal orders must reject further lifecycle changes.
- Monetary values must use integer minor units and `BDT`.
- Server code must recompute subtotal and total.
- Order lines must snapshot catalog display fields.
- Product variants must belong to the same organization and must not be archived.
- Reservation quantities must derive from order lines.
- Fulfillment movement lines must derive from the linked reservation.
- Cancelling a reserved or confirmed order must release the linked active reservation.
- Fulfilling an order must consume the linked active reservation exactly once.
- Versioned lifecycle commands must require `expectedVersion`.
