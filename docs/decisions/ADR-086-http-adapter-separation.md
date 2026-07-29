# ADR-086: HTTP Adapter Separation

## Status

Accepted

## Decision

Introduce `@senvo/http` as a server-only Node HTTP runtime adapter in front of the transport-independent `@senvo/api` package. The adapter owns HTTP routing, headers, bounded JSON parsing, request IDs, security headers, and HTTP status translation.

## Rationale

Using the Node standard library establishes a real runtime without coupling the API boundary to a frontend framework. Injected API handlers and request-context factories keep future migration to Next.js route handlers or another server runtime straightforward.

## Consequences

The adapter cannot contain business rules or access database infrastructure. Development identity headers are explicitly limited to test and development construction. A future production authentication mechanism must provide a separate trusted request-context factory without changing API handlers or application services.
