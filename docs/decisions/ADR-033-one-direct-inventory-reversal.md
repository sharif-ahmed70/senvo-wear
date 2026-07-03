# ADR-033: One Direct Inventory Reversal Per Original

## Status

Accepted

## Decision

An original inventory movement may have at most one direct reversal.

## Consequences

PostgreSQL enforces the rule with an organization-scoped unique reversal link. Later correction workflows that need additional adjustment must create normal adjustment movements, not multiple reversals of the same original.
