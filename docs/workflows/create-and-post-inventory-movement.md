# Create and Post Inventory Movement

## Create Draft

The caller sends a movement type, organization, movement number, idempotency key, valid source/destination shape, occurred timestamp, and one or more lines.

The application validates:

- UUIDs
- movement type
- movement shape
- line count up to 500
- positive integer quantities
- duplicate variant lines
- bounded note and reference fields

If `organizationId + idempotencyKey` already exists with the same intended payload, the existing movement is returned. If the payload differs, the request fails as an idempotency conflict.

## Replace Draft Lines

Draft lines may be replaced before posting. Replacing lines recalculates the movement payload signature. Posted movement lines cannot be replaced.

## Post

Posting runs inside one PostgreSQL transaction:

1. Lock the movement row.
2. Load movement and lines.
3. Return the existing result if already POSTED.
4. Validate active organization, active locations, and non-archived variants.
5. Acquire deterministic advisory transaction locks for affected organization/location/variant keys.
6. Recompute source balances after locks.
7. Reject negative stock.
8. Set status POSTED and `postedAt`.
9. Commit once.

Retries of posting the same movement return the already-posted result and do not duplicate the ledger effect.
