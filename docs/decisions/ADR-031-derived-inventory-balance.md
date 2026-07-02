# ADR-031: Derived Inventory Balance

## Status

Accepted

## Context

The first inventory foundation needs accurate on-hand balance without introducing editable stock quantities or premature availability/costing semantics.

## Decision

On-hand balance is derived from POSTED movement lines. The first implementation uses a focused parameterized SQL query repository instead of a SQL view or balance table.

## Consequences

There is one source of truth: the ledger. Query performance can be revisited with measured data before adding a view or materialized projection.
