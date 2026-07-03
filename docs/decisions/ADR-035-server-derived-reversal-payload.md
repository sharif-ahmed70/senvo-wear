# ADR-035: Server-Derived Reversal Payload

## Status

Accepted

## Decision

Clients cannot provide reversal lines, quantities, source, destination, or movement type. The application derives the compensating payload from the original movement.

## Consequences

Reversal requests cannot tamper with stock impact. Contracts only accept reversal identity, idempotency, reason, occurred timestamp, and optional reference metadata.
