# Testing Strategy

The repository uses Vitest for unit, application, API, UI, and PostgreSQL integration tests, with Turborepo orchestrating workspace checks.

Current suites cover organization isolation, authentication and authorization rules, catalog, inventory locking and reservations, sales orders, POS checkout and payment workflows, returns/refunds, Storefront cart and checkout behavior, HTTP/API mapping, and Admin route behavior.

Boundary checks are part of the quality gate through `pnpm boundary:check`. CI also deploys migrations to PostgreSQL, runs database integration tests, resets and reapplies migrations, reruns the tests, and verifies Prisma drift.
