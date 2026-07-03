# Reservation Consumption Coordination

`ConsumeInventoryReservation` coordinates reservation confirmation and inventory issue posting in one PostgreSQL transaction.

The workflow uses the same advisory lock namespace as inventory posting, reversal, and reservation creation:

```text
organizationId:stockLocationId:productVariantId
```

Keys are de-duplicated, sorted lexicographically, and acquired with `pg_advisory_xact_lock(hashtextextended(key, 0))`. The lock is transaction-scoped, so posting, reversal, reservation creation, and reservation consumption serialize on the same balance rows without a separate lock table.

The transaction order is:

1. Resolve movement idempotency by organization and key.
2. Lock the reservation row with `FOR UPDATE`.
3. Validate organization, status, expected version, expiry, lines, location, variants, and missing linkage.
4. Acquire balance advisory locks in deterministic order.
5. Recompute physical on-hand for every reservation line.
6. Create one `POSTED` `ISSUE` movement from the reservation location.
7. Copy reservation lines to movement lines in deterministic line order.
8. Confirm the reservation, increment version once, and store `consumedByMovementId`.

The command never composes two independently committing repositories. Prisma transactions remain inside the database package.
