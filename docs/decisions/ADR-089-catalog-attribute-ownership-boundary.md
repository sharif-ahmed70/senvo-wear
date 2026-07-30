# ADR-089: Catalog Attribute Ownership Boundary

## Status

Accepted

## Context

Product variants need reusable color and size references. Treating those
values as free-form product input would make normalization, ordering,
organization isolation, and lifecycle control inconsistent.

## Decision

Colors and sizes are organization-owned catalog records. Their creation uses
existing domain rules, while catalog management repository capabilities add
organization-scoped list and status operations. API contracts never accept an
organization identifier; trusted application context establishes scope.

The admin product form resolves active attributes through the typed API client
and submits their identifiers when creating a variant. UI permission checks
control visibility only. Protected API handlers remain the authorization
authority.

## Consequences

- Duplicate color and size codes are prevented per organization.
- Attribute lifecycle changes do not delete records referenced by variants.
- Cross-organization reads and updates return no record.
- Product forms use maintained reference data instead of manual identifiers.
- Attribute metadata editing and pagination remain future work.
