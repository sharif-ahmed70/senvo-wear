# ADR-016: Stock Location Identity No Balance Boundary

Date: 2026-07-02

## Status

Accepted

## Context

The system needs to know where inventory may later be held, but inventory quantities require ledger and movement rules that are outside the current slice.

## Decision

Stock locations are identity records only. They include branch ownership, code, type, status, and sellable policy. They do not include stock balances, reserved quantities, movements, bins, racks, shelves, or transfer workflows.

## Consequences

Future inventory work can attach balance and movement models to stable locations without rewriting operational identity.

## Alternatives Considered

Adding quantity fields now was rejected because it would create inventory state without the ledger, reconciliation, and audit rules needed to keep it correct.
