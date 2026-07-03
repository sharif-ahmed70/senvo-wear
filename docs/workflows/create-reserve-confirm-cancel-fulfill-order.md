# Create, Reserve, Confirm, Cancel, Fulfill Order

## Create

1. Validate organization, channel, currency, idempotency key, and lines.
2. Validate each variant belongs to the organization and is not archived.
3. Snapshot product name, SKU, color, and size.
4. Compute line totals, subtotal, and total.
5. Persist a `DRAFT` order and immutable lines.

## Reserve

1. Require `expectedVersion`.
2. Lock the order row.
3. Require `DRAFT` and an allocation policy.
4. Derive reservation lines from order lines.
5. Select an eligible allocation location deterministically.
6. Create an active reservation and link it to the order.
7. Transition to `RESERVED`.

## Confirm

1. Require `expectedVersion`.
2. Require `RESERVED`.
3. Verify the linked reservation is still active.
4. Transition to `CONFIRMED`.

## Cancel

1. Require `expectedVersion`.
2. If `DRAFT`, transition directly to `CANCELLED`.
3. If `RESERVED` or `CONFIRMED`, release the active reservation and transition to `CANCELLED`.

## Fulfill

1. Require `expectedVersion`.
2. Require `CONFIRMED` and an active reservation.
3. Derive a posted `ISSUE` movement from reservation lines.
4. Mark the reservation consumed.
5. Link the movement and transition to `FULFILLED`.
