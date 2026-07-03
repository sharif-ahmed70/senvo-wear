# ADR-048 One Reservation To One Consumption Movement

## Status

Accepted

## Context

Consumption must be auditable and idempotent. Reference strings are not sufficient integrity relationships.

## Decision

`InventoryReservation.consumedByMovementId` is the authoritative linkage to `InventoryMovement`. The database enforces same-organization linkage, restrictive deletion, and one movement per reservation consumption.

## Consequences

Read models can expose `consumedByMovementId`, `isConsumed`, and movement-side `consumesReservationId` without adding reporting-specific indexes.
