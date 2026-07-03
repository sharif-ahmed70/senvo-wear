# Preview And Allocate Inventory

## Preview

1. Caller sends organization, active allocation policy, lines, and optional preferred branch/location.
2. The system validates policy ownership and requested variants.
3. Candidate locations are ordered deterministically.
4. The first eligible location with enough ATS for every line is returned.
5. No reservation, movement, or lock is created.

Preview is only a snapshot. Another transaction can consume or reserve stock immediately after preview.

## Allocate And Create Reservation

1. Caller sends the same selection inputs plus reservation number and idempotency key.
2. The system validates the active policy and active variants again.
3. Candidate locations are ordered deterministically.
4. For each candidate, advisory locks are acquired for sorted variant keys.
5. On-hand and active reserved quantities are recomputed inside the transaction.
6. The first location that can fulfill every line creates one active reservation.
7. If none can fulfill all lines, no reservation is created.

Allocation never creates movements and never splits a reservation across stock locations.
