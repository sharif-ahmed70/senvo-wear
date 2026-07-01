# Database Package

`@senvo/database` contains the Prisma ORM foundation for PostgreSQL plus the organization and catalog identity persistence model.

## Prisma Pattern

Prisma 7 is configured for ESM with an explicit generated client output at `generated/prisma`. PostgreSQL connectivity uses `@prisma/adapter-pg`; callers must not instantiate Prisma Client without an adapter.

`db:generate` is non-destructive. Shared generated Prisma output is removed only by explicit `clean` commands, not by build, lint, typecheck, test, or generation tasks.

## Local Setup

Set `DATABASE_URL` in an untracked environment file before connecting to a real database.

Prisma `validate` and `generate` use an explicit invalid placeholder URL only when no `DATABASE_URL` is present outside staging/production. The placeholder is not suitable for connectivity and is intentionally not a localhost database.

```sh
pnpm --filter @senvo/database db:validate
pnpm --filter @senvo/database db:generate
```

Runtime client creation, migration creation, migration deployment, and development-only `db push` require a real `DATABASE_URL`.

## Test Database Verification

Use a dedicated PostgreSQL database whose name includes `test`.

```sh
pnpm db:test:start
pnpm db:test:ensure
pnpm verify:database
pnpm db:test:stop
```

`db:test:start` is optional and requires Docker. Without Docker, provide `TEST_DATABASE_URL` and `TEST_SHADOW_DATABASE_URL` from another local or ephemeral PostgreSQL instance.

## Migration Policy

Schema changes must be generated as Prisma migrations, reviewed in pull requests, and applied through controlled deployment. `prisma db push` is useful for short-lived local experiments but must not be used in production because it bypasses reviewed migration history.

The initial migration includes manually reviewed PostgreSQL check constraints for catalog sort order and optional color hex format. Keep their names stable and verify them in integration tests when future migrations are generated.
