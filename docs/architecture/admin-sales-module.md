# Admin Sales Order Management Module

## Purpose

The admin sales module provides organization-scoped order discovery, order
details, and access to the existing sales lifecycle. It does not own sales
rules. The sales domain remains the authority for reserve, confirm, fulfill,
and cancel transitions.

## Request Path

The module follows the standard boundary chain:

`Admin UI -> AdminApiClient -> HTTP adapter -> API handler -> SalesApplicationService -> Domain -> Repository -> PostgreSQL`

The admin application imports contracts only. It has no domain, application,
database, or Prisma dependency.

## Read Model

`SalesOrderReadRepository` exposes two projections:

- a cursor-paginated order list with order-number search, status filtering,
  and newest/oldest date ordering;
- an order detail projection containing immutable customer, delivery, and line
  snapshots together with reservation and fulfillment movement linkage.

`PrismaSalesOrderReadRepository` always includes `organizationId` in list and
detail predicates. A cross-organization identifier therefore resolves to the
same safe not-found result as a missing identifier.

The read model uses existing sales, reservation, stock-location, and movement
tables. No schema migration is required.

## Lifecycle Delegation

The public action body contains only `expectedVersion`; `salesOrderId` comes
from the route. Organization identity comes from trusted application context.
The contracts reject organization identifiers, status overrides, totals,
snapshots, reservation records, and movement payloads supplied by clients.

Admin actions delegate to the existing sales use cases. The application layer
derives deterministic reservation and fulfillment idempotency keys and record
numbers from the order identifier, action, and expected version. Existing
optimistic concurrency and lifecycle validation remain unchanged.

## Authorization

- `SALES_ORDER:READ` protects list and detail operations.
- `SALES_ORDER:UPDATE` protects reserve, confirm, fulfill, and cancel.

The UI uses these permissions only to control visibility. API and application
boundaries enforce authorization independently.

## Admin Experience

`/sales/orders` provides search, status filtering, cursor pagination, loading,
empty, and safe error states. `/sales/orders/[id]` presents summary, customer,
delivery, line, inventory, and timeline information. Lifecycle buttons reflect
the current status for usability, while backend rules remain authoritative.

The layouts retain horizontal table access where necessary and collapse detail
sections and controls for a 390px viewport.

## Excluded Responsibilities

This module does not implement payment capture, invoicing, accounting, refunds,
returns, customer management, POS, or checkout behavior. Those capabilities
require separate boundaries and decisions.
