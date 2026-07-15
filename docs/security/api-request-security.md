# API Request Security

## Trusted Request Context

`ApiRequestContext` is server-owned and contains `requestId`, `authenticatedUser`, `organizationId`, and permissions. Future HTTP adapters must derive it from trusted middleware and route configuration, never by spreading request bodies, headers, or query parameters into the context.

The authentication boundary verifies the user reference before an application context is created. Authorization then verifies organization membership and the required resource action. The authenticated principal becomes both `actorId` and `userId` in the application context.

## Validation and Disclosure

Existing strict contract schemas reject unknown payload fields before protected operations run. Context fields are validated by the existing application-context validator.

Gateway responses contain only stable public codes, messages, optional field errors, and the request ID. They do not expose stack traces, database errors, raw exceptions, credentials, or authorization internals.

## Defense in Depth

Gateway authorization is a fail-fast transport boundary. Application services continue enforcing their authorization requirements, and transactional operations keep their final authorization check inside the database transaction.
