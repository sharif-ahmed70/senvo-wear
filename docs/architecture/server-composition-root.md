# Server Composition Root

The server composition root lives in `@senvo/application`.

`createApplicationServices()` wires application services to infrastructure repositories. The default sales wiring uses `PrismaSalesOrderRepository` from `@senvo/database`.

## Prisma Lifecycle

1. Importing `@senvo/application` does not create a Prisma client.
2. Calling `createApplicationServices()` creates repository instances only when no repository is injected.
3. Development uses the shared Prisma client by default.
4. Production can create an owned Prisma client and close it through `disconnect()`.
5. Tests can inject repositories and avoid database access entirely.

Adapters should construct services in server-only modules and pass trusted context from their own authentication/session boundary.
