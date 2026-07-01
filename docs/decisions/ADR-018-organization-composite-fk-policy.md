# ADR-018: Organization Composite FK Policy

Date: 2026-07-02

## Status

Accepted

## Context

Branch-owned records carry both `organizationId` and `branchId`. Application checks are useful but cannot be the only protection against cross-organization references.

## Decision

Use composite foreign keys for branch-owned operational records. `StockLocation` and `PosCounter` reference `Branch` through `(branchId, organizationId)` to ensure the branch belongs to the same organization.

## Consequences

PostgreSQL enforces organization isolation even when records are written outside the application use cases. The schema includes a composite unique key on `Branch(id, organizationId)` to support those foreign keys.

## Alternatives Considered

Application-only same-organization checks were rejected because they are race-prone and bypassable. A separate tenant table was deferred until broader tenancy requirements exist.
