# Database Migration Policy

The first business migration is `202607010001_init_organization_catalog_identity`.

Database changes must use Prisma migrations. Migration files should be reviewed for destructive operations, locking risk, backfill needs, and rollback strategy.

Do not use `prisma db push` in production because it bypasses migration review and durable history.

Repository scripts distinguish:

- `db:validate`: validates Prisma schema without requiring a live database in development/CI.
- `db:generate`: generates the Prisma client without requiring a live database in development/CI.
- `db:migrate:create`: creates reviewed migration files and requires `DATABASE_URL`.
- `db:migrate:deploy`: deploys migrations only for staging/production with `DATABASE_URL`.
- `db:push:dev`: development-only and requires `SENVO_ALLOW_DB_PUSH=local`.

Test-only commands:

- `db:test:ensure`: creates the dedicated test and shadow databases when an admin test URL is available.
- `db:test:migrate`: deploys migrations to `TEST_DATABASE_URL`.
- `db:test:status`: reports Prisma migration status for `TEST_DATABASE_URL`.
- `db:test:reset`: resets only a guarded test database.
- `db:test:drift`: compares checked-in migrations to the Prisma schema using `TEST_SHADOW_DATABASE_URL`.
- `verify:database`: generates the client, applies migrations, runs integration tests, resets from zero, reapplies migrations, reruns integration tests, and runs drift checks when a shadow database URL exists.

All test database commands guard against production/staging-looking environment labels and database names. Test database names must clearly include `test`.

Prisma generation policy:

- `db:generate` must not delete generated output.
- Build, lint, typecheck, and test tasks must not clean Prisma generated files.
- Root `clean` may remove generated Prisma output as an explicit maintenance action.
- Turbo task dependencies should make `db:generate` run before tasks that import the generated client.

Manual check constraints:

- PostgreSQL check constraints that Prisma cannot fully model must use stable explicit names.
- Migration review must verify those constraints remain present and are not silently dropped by future generated SQL.
- Integration tests should assert manually reviewed check constraints exist and reject invalid rows.
