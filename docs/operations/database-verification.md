# Database Verification

Use this workflow for the catalog identity migration and future database slices.

## Local PostgreSQL

Docker is optional:

```sh
pnpm db:test:start
```

If Docker is unavailable, provide an external dedicated PostgreSQL database instead. Use `.env.test.example` as the shape of the required variables.

Required variables:

- `TEST_DATABASE_URL`
- `TEST_SHADOW_DATABASE_URL`
- `TEST_ADMIN_DATABASE_URL`, only when `db:test:ensure` must create databases

All test database names must clearly include `test`. The scripts refuse production/staging-looking environment labels and targets.

## Verification

```sh
pnpm db:test:ensure
pnpm verify:database
```

`verify:database` performs:

1. Prisma client generation.
2. Migration deploy to the test database.
3. Prisma migration status.
4. Catalog PostgreSQL integration tests.
5. Test database reset from zero.
6. Migration redeploy.
7. Catalog PostgreSQL integration tests again.
8. Migration drift check when `TEST_SHADOW_DATABASE_URL` is set.

Do not use `prisma db push` as a substitute for migration verification.

## Generated Prisma Client

`db:generate` is non-destructive. The root `clean` command may delete generated Prisma output, but build, lint, typecheck, and test tasks must not delete it while other tasks may import it.

Run this regression check after graph changes:

```sh
pnpm verify:generated-client-race
```
