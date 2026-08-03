# ADR-091: Sales Admin Boundary

## Status

Accepted

## Context

Admin operators need to find orders, inspect the snapshots and inventory links
that explain their current state, and invoke existing lifecycle operations.
Putting joins or transition rules in the admin application would bypass the
established API and sales domain boundaries. Reusing the aggregate repository
for every screen would also couple operational writes to UI-specific read
shapes.

## Decision

Create a dedicated organization-scoped sales order read repository and expose
its projections through the existing application, API, and HTTP boundaries.
Keep lifecycle writes delegated to the existing sales use cases.

Public admin action contracts accept only the order identifier and optimistic
version. Organization scope is obtained from trusted context. Reservation and
fulfillment integration identifiers are derived by the application service,
not accepted from the browser.

Require `SALES_ORDER:READ` for queries and `SALES_ORDER:UPDATE` for lifecycle
actions at backend boundaries. UI permission checks are visibility controls
only.

## Consequences

- The admin app remains free of domain and database dependencies.
- Cross-organization reads retain safe not-found behavior.
- Existing lifecycle, concurrency, and idempotency rules remain authoritative.
- Read projections can evolve without rewriting aggregate write behavior.
- The current tables already provide the required snapshots and inventory
  links, so no migration is introduced.
- Payment, invoice, accounting, refund, and return responsibilities remain
  outside this boundary.
