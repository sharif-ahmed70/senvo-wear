# ADR-079: Authorization at Application Boundary

## Status

Accepted

## Context

Application services already receive trusted execution context and inject organization identity into domain operations. Authorization should use that context before protected work is performed.

## Decision

Add an authorization hook to application services and demonstrate it on one sales operation and one inventory operation. Authorization checks happen before domain mutation and return safe application errors when denied.

## Consequences

The pattern is available without adding authentication transport or spreading checks across every operation at once. Future work can expand coverage operation by operation while preserving existing organization isolation.
