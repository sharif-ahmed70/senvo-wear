# ADR-043 Atomic Movement Posting Plus Reservation Confirmation

## Status

Accepted

## Context

Consuming a reservation must reduce physical on-hand and remove active reserved quantity without leaving partial ledger or reservation state.

## Decision

Reservation consumption is one PostgreSQL transaction that creates a posted `ISSUE` movement and updates the reservation to `CONFIRMED` with linkage.

## Consequences

The system cannot commit a posted consumption movement with an active reservation, or a consumed reservation without the movement.
