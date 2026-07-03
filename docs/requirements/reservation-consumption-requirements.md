# Reservation Consumption Requirements

Reservation consumption converts one active reservation into one posted outbound inventory movement.

Rules:

- The caller supplies only organization, reservation, expected version, movement number, idempotency key, occurred time, and optional reference/note.
- Movement type is always `ISSUE`.
- Source location is the reservation stock location.
- Destination is `null`.
- Lines and quantities are copied exactly from the reservation.
- Partial consumption and multi-reservation consumption are not supported.
- The reservation must be `ACTIVE`, unexpired at transaction time, same organization, and not already linked to a consumption movement.
- Physical on-hand is recomputed at consumption time; insufficient stock rejects the full transaction.
- Successful consumption sets the reservation to `CONFIRMED`, clears active reserved quantity, links the movement, and increments reservation version once.
- Identical idempotent retries return the same reservation and movement. Conflicting idempotency reuse is rejected.

Consumption does not create sales, payment, customer, procurement, costing, accounting, authentication, HTTP, or UI behavior.
