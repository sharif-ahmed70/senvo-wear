# API Gateway Boundary

`@senvo/api` is a server-only, transport-independent adapter between a future HTTP transport and `@senvo/application`. It does not depend on Next.js, an HTTP framework, Prisma, or database repositories.

## Request Pipeline

Protected handlers execute the following sequence:

1. Parse the input with an existing strict contract schema.
2. Authenticate the server-owned caller reference.
3. Convert `ApiRequestContext` into the validated `ApplicationContext`.
4. Authorize the required resource action.
5. Call the application service.
6. Map the application result to the standard API response contract.

Input payloads never supply `organizationId`, permissions, actor identity, or `requestId`. A transport adapter must construct those values as trusted server context.

## Operation Adapters

The foundation exposes handlers for sales order creation and inventory movement posting. Application services retain their own checks, including transactional authorization, as defense in depth. The gateway contains no business rules and does not own transactions.

## Errors

Validation, authentication, authorization, not-found, conflict, concurrency, and internal failures map to stable public error codes. Unknown failures return `INTERNAL.UNEXPECTED`; stack traces and original exception messages are never returned.

| Gateway condition    | Public code                    |
| -------------------- | ------------------------------ |
| Validation error     | `VALIDATION.INVALID_INPUT`     |
| Authentication error | `AUTHENTICATION.REQUIRED`      |
| Forbidden            | `AUTHORIZATION.FORBIDDEN`      |
| Not found            | `NOT_FOUND.RESOURCE`           |
| Conflict             | `CONFLICT.STATE`               |
| Concurrency error    | `CONCURRENCY.VERSION_MISMATCH` |
| Internal error       | `INTERNAL.UNEXPECTED`          |
