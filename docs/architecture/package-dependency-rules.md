# Package Dependency Rules

Applications may depend on `@senvo/ui`, `@senvo/contracts`, `@senvo/domain`, `@senvo/config`, and server-only infrastructure packages from server code only.

`@senvo/application` may depend on contracts, domain use cases, logger interfaces, and database repositories at the composition boundary. It must not depend on UI, React, Next.js, or Prisma generated types directly.

`@senvo/domain` must not depend on Next.js, React, Prisma, UI, storage providers, logger transports, or database implementations.

`@senvo/contracts` must not expose Prisma-generated types, database records, internal domain entities by default, secret fields, or internal-only fields.

`@senvo/database` must not depend on UI, React, Next.js page components, or business presentation code.

`@senvo/database` may depend on `@senvo/domain` repository interfaces and application errors for infrastructure implementations.

UI packages and client modules must not import `@senvo/application` or `@senvo/database`.

`@senvo/utils` must not contain pricing, inventory, order, authentication, or database access logic.

The root `pnpm boundary:check` command enforces the most important forbidden import directions.
