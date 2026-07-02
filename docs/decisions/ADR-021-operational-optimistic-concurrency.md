# ADR-021: Operational Optimistic Concurrency

Date: 2026-07-02

## Status

Accepted

## Context

Metadata and lifecycle updates can be made from multiple future applications. `updatedAt` alone is not enough to safely reject stale writes.

## Decision

Branches, stock locations, and POS counters use an integer `version` field. Update commands require `expectedVersion`. Repositories update only when `id`, `organizationId`, and `version` match, then increment version atomically.

## Consequences

Lost updates are rejected with a stable concurrency error. The version field is limited to operational entities and does not change catalog entities.

## Alternatives Considered

Timestamp comparison was rejected because timestamp precision and serialization can be awkward at API boundaries. Pessimistic locks were rejected as unnecessary for this early metadata lifecycle slice.
