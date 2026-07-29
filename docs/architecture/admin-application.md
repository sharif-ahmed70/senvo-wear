# Admin Application

`apps/admin` is the SENVO Wear operational administration boundary. It is a Next.js application that renders administration routes and communicates with backend operations through the standard HTTP API response contract.

## Boundary

The application may depend on browser-safe contracts and shared UI primitives. It cannot import domain models, application services, database infrastructure, Prisma, or the Node HTTP adapter. Business validation and authorization remain on the backend.

The initial routes are:

- `/` for the operations dashboard
- `/catalog`
- `/inventory`
- `/sales-orders`
- `/organization`
- `/users`

Each route is a workspace foundation, not a complete business feature.

## Access State

`AdminSession` is a UI-facing placeholder for the future authenticated server boundary. It carries display identity, organization, role, and view permissions. The current foundation session exists only to render the shell while authentication is not implemented.

Navigation visibility is permission-aware, but it is not an authorization control. Every API operation must still authenticate and authorize at the backend application boundary.

## API Client

`AdminApiClient` wraps `fetch` and the standard `ApiResponse` envelope. It:

- sends or accepts an explicit request ID
- returns typed data with the response request ID
- maps API failures to `AdminApiError`
- maps network and malformed-response failures to safe client errors

It does not contain business rules, persist credentials, or access repositories.

## Runtime States

The root shell provides a responsive navigation layout and organization context. Next.js route boundaries provide loading and safe error states. A missing session renders an access-required state without protected navigation or content.
