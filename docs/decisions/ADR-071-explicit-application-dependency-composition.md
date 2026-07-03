# ADR-071: Explicit Application Dependency Composition

## Status

Accepted

## Decision

Application services receive repositories, logger, clock, and request ID generator through explicit dependencies.

## Rationale

Explicit composition keeps domain use cases testable and lets adapters or tests choose infrastructure without hidden global state.

## Consequences

The default composition root wires Prisma repositories. Tests can inject in-memory repositories and avoid database connections.
