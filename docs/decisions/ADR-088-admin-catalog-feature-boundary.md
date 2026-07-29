# ADR-088: Admin Catalog Feature Boundary

## Status

Accepted

## Context

The admin application needs real catalog workflows while preserving the
existing separation between UI, transport, application, domain, and database
layers. UI convenience checks must not become authorization decisions, and
organization identifiers supplied by a browser are not trusted.

## Decision

Catalog pages call typed methods on `AdminApiClient`. The HTTP adapter routes
requests to strict protected API handlers. Those handlers authenticate,
authorize a catalog permission, and call `CatalogApplicationService`.

The service derives organization scope from `ApplicationContext`, invokes
existing catalog domain creation rules, and uses dedicated catalog management
repository contracts for reads and lifecycle changes. Prisma remains confined
to the database package.

Product creation may include one optional collection assignment. Initial
variant creation is a subsequent explicit API operation so product and variant
remain separate domain concepts.

## Consequences

- Admin code has no direct Prisma, database, application, or domain imports.
- Backend authorization remains authoritative even when UI controls are hidden.
- Catalog reads and writes are organization scoped at the application and
  repository boundaries.
- Product creation followed by initial variant creation is not yet one atomic
  transaction. A later catalog transaction use case may address that without
  changing the UI boundary.
- Pagination, color and size management screens, and product editing are
  intentionally outside this foundation.
