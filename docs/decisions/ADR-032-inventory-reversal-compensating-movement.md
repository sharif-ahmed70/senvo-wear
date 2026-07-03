# ADR-032: Inventory Reversal Uses Compensating Movement

## Status

Accepted

## Decision

Posted inventory corrections are represented by a new compensating posted movement rather than by mutating or voiding the original movement.

## Consequences

The audit trail remains append-only. Balances continue to derive from posted lines. Correction reads must derive reversed state from linkage rather than a mutable status.
