# ADR-026: Immutable Inventory Ledger as Source of Truth

## Status

Accepted

## Context

Inventory history must be auditable and resilient to accidental mutation.

## Decision

Posted inventory movements and lines are immutable. On-hand stock is derived from posted ledger lines. Corrections must use compensating movements in a later workflow.

## Consequences

Inventory history remains auditable. Operational corrections require explicit new movements rather than direct edits.
