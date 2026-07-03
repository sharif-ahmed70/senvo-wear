# ADR-045 ATS Invariance During Reservation Consumption

## Status

Accepted

## Context

Active reservations already reduce available-to-sell. Consuming a reservation also reduces on-hand.

## Decision

Consumption removes the reservation from active reserved quantity at the same time it posts the outbound movement.

## Consequences

For the consumed quantity, ATS stays unchanged: on-hand decreases and active reserved quantity decreases by the same amount.
