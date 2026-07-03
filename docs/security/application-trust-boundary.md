# Application Trust Boundary

Application services are the first server-side boundary after an adapter has authenticated or identified a caller.

## Trusted Context

`organizationId`, `actorId`, `actorType`, `source`, and `requestId` are context fields. They are not accepted from sales service payload bodies.

The service validates these fields before domain execution. Invalid context returns a validation service error.

## PII and Secret Handling

Application service logs must not include customer names, phone numbers, email addresses, delivery addresses, idempotency keys, payload signatures, stack traces, SQL, or raw payloads.

Unexpected errors return a generic public message and log only the error class name with safe operational metadata.
