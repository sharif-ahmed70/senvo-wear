# Application Service Boundary

`@senvo/application` is the server-only application boundary between adapters and core domain use cases.

The package validates adapter payloads, injects trusted execution context, calls domain use cases, maps domain models to service contracts, normalizes errors, and records safe operational logs.

## Rules

1. Adapters pass `ApplicationExecutionContext` plus untrusted payloads.
2. `organizationId` comes only from the trusted execution context.
3. Payload schemas in `@senvo/contracts` omit `organizationId` for service inputs.
4. Domain use cases remain the business source of truth.
5. Database repositories are composed in the server composition root, not inside domain code.
6. Service output contracts do not expose internal idempotency or payload signature fields.
7. Logs include operation, request ID, organization ID, actor type, source, duration, and result only.

## Sales Service

The sales service exposes create, amend, reserve, confirm, cancel, fulfill, get, and list operations for sales orders.

It returns result objects instead of throwing adapter-visible errors:

```ts
{ ok: true, data }
{ ok: false, error: { code, message, requestId, retryable } }
```

Adapters can map these results to HTTP, jobs, or future POS flows without importing domain internals.
