# ADR-044 Server-Derived Consumption Movement

## Status

Accepted

## Context

Allowing clients to supply movement type, source, destination, or lines during consumption would let callers bypass the reservation contract.

## Decision

Consumption commands accept no movement lines, quantities, source, destination, or movement type. The server derives one `ISSUE` movement from the reservation.

## Consequences

The reservation is the authority for quantity and location. External references remain optional correlation data only.
