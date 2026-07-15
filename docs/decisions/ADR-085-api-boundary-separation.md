# ADR-085: API Boundary Separation

## Status

Accepted

## Decision

Introduce `@senvo/api` as a server-only, transport-independent application gateway. Handlers validate existing contracts, authenticate, create the application context, authorize, invoke an application service, and map its result to the shared API response contract.

## Rationale

Keeping transport adaptation outside application and domain packages prevents controllers from accumulating business rules and allows future HTTP frameworks to remain replaceable. Reusing existing contracts and security boundaries avoids a second validation or permission model.

## Consequences

Future transports must construct trusted request context explicitly and delegate to an API handler. The package cannot depend on HTTP frameworks, UI packages, Prisma, or database infrastructure. Application services retain defense-in-depth authorization and transaction ownership.
