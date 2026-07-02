# ADR-023: Operational Cursor Pagination

## Status

Accepted

## Context

Operational branches, stock locations, and POS counters need bounded list queries without total-count requirements. Offset pagination can skip or duplicate records as data changes and becomes increasingly expensive on deeper pages.

## Decision

Operational read queries use cursor pagination ordered by `createdAt` ascending and `id` ascending. Cursors encode the ordered position and are validated before repository access. Page size defaults to 25 and is capped at 100.

## Consequences

Lists are deterministic and bounded without count queries. Clients can continue with `nextCursor` until it is null. Total-count analytics remain outside this slice.
