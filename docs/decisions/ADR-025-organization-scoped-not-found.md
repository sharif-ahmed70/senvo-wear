# ADR-025: Organization-Scoped Not Found

## Status

Accepted

## Context

Operational entity identifiers are organization-owned. A get query that reveals whether an id exists in another organization creates unnecessary enumeration risk.

## Decision

Get-by-id queries require `organizationId` and entity id. Repositories scope the lookup by both values. Missing rows and cross-organization rows both return the same not-found application error.

## Consequences

Callers cannot distinguish absent records from records owned by another organization. List queries also require organization scope, preventing cross-tenant data exposure.
