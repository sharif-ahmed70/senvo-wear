# ADR-072: Injected Clock and Request Context

## Status

Accepted

## Decision

Application services use an injected clock and generated or provided request IDs for operation metadata.

## Rationale

Request IDs are required for traceability, and injected clocks make timing behavior testable without sleeping or relying on wall-clock timing.

## Consequences

Every service error includes a request ID. Logs include duration from the injected clock.
