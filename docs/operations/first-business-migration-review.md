# First Business Migration Review

Migration: `202607010001_init_organization_catalog_identity`

Generation command:

```sh
$env:DATABASE_URL='postgresql://prisma-placeholder.invalid:5432/senvo_wear_prisma_cli_placeholder'
corepack pnpm --filter @senvo/database exec prisma migrate diff --from-empty --to-schema prisma\schema.prisma --script
```

Initial database used: none. The command generated SQL from an empty schema to the Prisma schema using Prisma's offline diff mode.

Hardening follow-up: repository scripts and CI now provide a PostgreSQL verification path using `TEST_DATABASE_URL`, `TEST_SHADOW_DATABASE_URL`, and the `postgres-integration` CI job. This local workstation still does not have Docker, `psql`, a PostgreSQL service, `DATABASE_URL`, or `TEST_DATABASE_URL`, so the migration has not been applied locally from this workstation.

SQL review:

- Creates new enums, tables, indexes, unique constraints, and foreign keys only.
- Contains no `DROP`, destructive alteration, data deletion, or production data dependency.
- Uses restrictive foreign-key deletes.
- Includes organization-scoped uniqueness and composite foreign keys for cross-organization safety.
- Adds manual PostgreSQL check constraints for non-negative sort order and optional hex color format.

Rollback/recreation test: configured through `pnpm verify:database`, which applies migrations, runs catalog integration tests, resets the test database, reapplies migrations, reruns integration tests, and performs drift detection when a shadow database URL exists. It was not run locally on this workstation because no PostgreSQL database was available.
