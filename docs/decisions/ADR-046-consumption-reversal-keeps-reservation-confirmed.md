# ADR-046 Consumption Reversal Keeps Reservation Confirmed

## Status

Accepted

## Context

Movement reversal is an inventory correction. Reopening demand after a correction would require sales/order semantics that do not exist in inventory foundation.

## Decision

Reversing a reservation-generated issue movement increases on-hand, but the reservation remains `CONFIRMED` and active reserved quantity remains zero.

## Consequences

ATS increases after reversal. Reservation reactivation is explicitly deferred.
