# ADR-012: SKU Uniqueness Scope

Date: 2026-07-01

## Status

Accepted

## Context

SKUs identify sellable catalog variants and must be stable enough for future inventory, procurement, and sales references.

## Decision

SKU is manually supplied in this slice and unique within an organization.

## Consequences

The same SKU cannot be reused for another variant in the same organization. SKU auto-generation and future SKU-change restrictions are deferred.

## Alternatives Considered

Global SKU uniqueness was unnecessary for the current organization boundary. Product-scoped SKU uniqueness was rejected because it would allow ambiguous operational references.
