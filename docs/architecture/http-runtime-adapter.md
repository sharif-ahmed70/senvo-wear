# HTTP Runtime Adapter

`@senvo/http` is the replaceable Node HTTP boundary in front of `@senvo/api`. It uses the Node standard library and has no dependency on Next.js, React, Prisma, database repositories, or UI packages.

## Request Flow

1. Match the HTTP method and path.
2. Establish a valid request ID.
3. Apply baseline response security headers.
4. Build trusted `ApiRequestContext` through an injected context factory.
5. Parse the JSON body with a bounded payload size.
6. Call the selected `ApiHandler`.
7. Translate the standard API response category to an HTTP status.

The adapter contains no domain rules, application-service orchestration, authorization decisions, or database access.

## Routes

| Method | Path                   | API operation           | Success status |
| ------ | ---------------------- | ----------------------- | -------------- |
| `POST` | `/sales-orders`        | Create sales order      | `201`          |
| `POST` | `/inventory/movements` | Post inventory movement | `200`          |

## Development Context

`DevelopmentHeaderRequestContextFactory` accepts only `development` or `test` construction and reads:

- `x-dev-user-id`
- `x-dev-organization-id`
- `x-dev-permissions`, formatted as comma-separated `RESOURCE:ACTION`

These headers are intentionally insecure development inputs and must never be exposed as a production identity mechanism. Production must inject a context factory backed by a future authenticated runtime boundary.

`DevelopmentAuthenticationService` similarly provides only a test/development identity adapter and rejects production construction.

## Request IDs and Errors

A syntactically valid `x-request-id` is preserved; otherwise the server generates a UUID. The ID is passed to the API handler and returned in both the response body and `x-request-id` header.

Malformed JSON, oversized bodies, invalid development context, route failures, and unexpected adapter exceptions use the standard API failure envelope. Unexpected exceptions expose neither stack traces nor original error messages.
