# Create, Confirm, Release, and Expire Reservation

Create reservation:

1. Normalize reservation number, idempotency key, note, reference pair, expiry, and lines.
2. Check idempotency.
3. Lock reservation allocation keys in deterministic order.
4. Recompute posted on-hand.
5. Recompute active reserved quantity.
6. Reject if requested quantity exceeds available-to-sell.
7. Insert the active reservation and immutable lines.

Confirm reservation:

1. Read active reservation by organization and id.
2. Require expected version.
3. Set status to `CONFIRMED`, set `confirmedAt`, and increment version.

Release and expire follow the same optimistic-concurrency pattern with `releasedAt` and `expiredAt`.

Confirmation does not post an outbound inventory movement. A later sales or order integration must atomically post the outbound movement and confirm the reservation in one workflow.
