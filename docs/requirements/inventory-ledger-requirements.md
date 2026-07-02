# Inventory Ledger Requirements

The first inventory foundation provides immutable stock movements and derived on-hand balance only.

## Scope

Included:

- draft movement creation with lines
- draft line replacement
- posting
- idempotent creation
- derived on-hand balance
- movement and balance read queries
- PostgreSQL integration coverage

Excluded:

- procurement
- sales
- reservations
- available-to-sell
- costing and valuation
- finance postings
- user attribution
- HTTP endpoints
- UI

## Business Rules

- Every movement belongs to exactly one organization.
- Movement numbers are unique per organization.
- Idempotency keys are unique per organization.
- Posted movements cannot be edited.
- Lines must use positive integer quantities.
- A product variant may appear at most once per movement.
- At least one line is required.
- Negative stock is not allowed.
- Source and destination locations must match the movement type.
- Transfer source and destination must differ.
- On-hand balance is derived only from POSTED movements.

## Read Requirements

Movement lists are ordered by `occurredAt desc, id desc`.

Balance lists are location-scoped and ordered by `productVariantId asc`.

Both use cursor pagination with default page size 25 and max page size 100.
