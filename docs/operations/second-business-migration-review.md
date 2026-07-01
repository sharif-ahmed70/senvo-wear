# Second Business Migration Review

Migration: `202607020001_add_organization_operational_structure`

Generation command:

```sh
corepack pnpm --filter @senvo/database exec prisma migrate diff --from-schema <previous-schema.prisma> --to-schema prisma/schema.prisma --script
```

Initial database used: none. Local PostgreSQL is unavailable on this workstation, so the migration was generated from the previous checked-in schema to the updated Prisma schema using Prisma's offline schema diff mode.

SQL review:

- Creates `BranchStatus`, `BranchType`, `StockLocationStatus`, `StockLocationType`, and `PosCounterStatus` enums.
- Creates `branches`, `stock_locations`, and `pos_counters` tables.
- Adds organization-scoped unique constraints for branch, stock location, and POS counter codes.
- Adds a composite unique key on `branches(id, organization_id)` so child records can enforce same-organization branch references.
- Adds composite foreign keys from stock locations and POS counters to branches through `(branch_id, organization_id)`.
- Uses restrictive foreign-key deletes and cascading updates.
- Contains no `DROP`, destructive alteration, data deletion, backfill, trigger, or production data dependency.

Rollback/recreation test: configured through `pnpm verify:database`, which applies migrations, runs database integration tests, resets the test database, reapplies migrations, reruns integration tests, and performs drift detection when `TEST_SHADOW_DATABASE_URL` is available. Local PostgreSQL was not available at migration creation time.
