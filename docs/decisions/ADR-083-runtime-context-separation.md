# ADR-083: Runtime Context Separation

## Status

Accepted

## Decision

Application execution uses a transport-independent `ApplicationContext` containing `requestId`, `userId`, `organizationId`, `role`, `permissions`, and `authenticationState`. Existing actor type and source fields remain available for internal and system execution.

Transport adapters will construct this context after authentication and organization access checks. Domain and application services do not depend on HTTP headers, cookies, sessions, or tokens.

## Consequences

Authorization, audit, and operational diagnostics can share one trusted runtime identity. Request IDs remain execution metadata and are not persisted as a dedicated database column; selected audit records may include them in screened metadata.
