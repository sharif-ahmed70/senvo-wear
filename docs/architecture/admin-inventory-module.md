# Admin Inventory Read Module

## Scope

The admin inventory module provides organization-scoped, read-only views for:

- variant availability by stock location
- stock locations and their branches
- inventory movement history
- one variant's availability across locations

It does not expose stock adjustment, receiving, purchasing, or any other
inventory mutation.

## Request Flow

```text
Admin UI
  -> typed AdminApiClient
  -> Node HTTP adapter
  -> protected API handler
  -> InventoryApplicationService
  -> inventory read use case
  -> InventoryReadRepository
  -> PostgreSQL
```

The HTTP and API layers accept filters and opaque cursors only. The trusted
request context supplies the organization. Client-provided `organizationId`
fields are rejected by strict contracts.

## Read Projections

`PrismaInventoryReadRepository` joins catalog and organization metadata onto
inventory records at the infrastructure boundary. The application and UI
receive only public projections:

- product and variant identity
- color and size display names
- stock location and branch display data
- movement type, status, date, and quantity
- derived inventory quantities

Internal ledger linkage, idempotency data, payload signatures, and organization
filter mechanics are not returned.

## Availability

The posted inventory ledger is the source of truth for on-hand quantity.
Destination lines add quantity and source lines subtract quantity. Draft
movements have no effect.

Active reservation lines are summed independently for the same organization,
variant, and location. Available to sell is derived by the query:

```text
availableToSell = onHand - reserved
```

Available to sell is never persisted. No balance or availability table is
introduced.

## Pagination and Ordering

All list queries use bounded cursor pagination:

- availability: SKU, location code, variant ID, location ID
- locations: branch name, location name, location ID
- movement history: occurrence time descending, movement ID descending, line
  number ascending

Cursors are opaque to callers. Invalid cursors produce validation errors.

## Authorization

Every query requires `INVENTORY.READ`. UI permission checks hide inaccessible
views, but backend authentication, trusted organization context, and
authorization remain authoritative.

## Product Detail

The product detail route reads product data through the catalog API and
requests availability for each variant through the inventory API. It displays
server-derived quantities and performs no inventory calculations.
