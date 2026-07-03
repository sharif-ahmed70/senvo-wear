# ADR-047 Shared Inventory Advisory Lock Namespace

## Status

Accepted

## Context

Posting, reversal, reservation, and consumption all affect on-hand or available-to-sell for the same location and variant keys.

## Decision

All workflows use the same advisory lock key composition: `organizationId:stockLocationId:productVariantId`. Keys are sorted before locking and scoped to the PostgreSQL transaction.

## Consequences

Inventory workflows serialize consistently and avoid deadlocks from incompatible lock ordering.
