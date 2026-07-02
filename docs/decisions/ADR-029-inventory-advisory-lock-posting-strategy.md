# ADR-029: Inventory Advisory Lock Posting Strategy

## Status

Accepted

## Context

On-hand balance is derived from ledger lines, so there is no balance row to lock with `SELECT FOR UPDATE`.

## Decision

Posting uses PostgreSQL transaction-level advisory locks keyed by organization, stock location, and product variant. Keys are acquired in sorted order to avoid deadlocks. Source balances are recomputed after locks and before posting.

## Consequences

Concurrent postings for the same balance key serialize without introducing an editable balance table. Posting must keep advisory lock key construction stable.
