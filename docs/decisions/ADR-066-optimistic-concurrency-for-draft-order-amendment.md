# ADR-066: Optimistic Concurrency for Draft Order Amendment

## Status

Accepted

## Decision

Draft order amendments use `expectedVersion` instead of amendment idempotency keys.

## Rationale

Amendment edits mutable draft state. Exact retries with stale versions should not silently reapply because another user or process may have changed the order. Version conflicts force the caller to re-read and make an intentional next edit.

## Consequences

Every amendment command requires `expectedVersion`. Stale retries return a concurrency error. No new amendment idempotency table is introduced.
