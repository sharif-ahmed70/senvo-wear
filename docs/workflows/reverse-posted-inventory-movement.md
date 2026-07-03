# Reverse Posted Inventory Movement

1. Caller submits organization ID, original movement ID, reversal movement number, idempotency key, reason, occurred timestamp, and optional reference pair.
2. Application loads the original movement in the same organization.
3. Application verifies the original is `POSTED`, is not itself a reversal, and has no existing reversal.
4. Application derives the compensating movement:
   - `OPENING` -> `ADJUSTMENT_OUT` from original destination.
   - `RECEIPT` -> `ADJUSTMENT_OUT` from original destination.
   - `ISSUE` -> `ADJUSTMENT_IN` into original source.
   - `TRANSFER` -> `TRANSFER` from original destination to original source.
   - `ADJUSTMENT_IN` -> `ADJUSTMENT_OUT` from original destination.
   - `ADJUSTMENT_OUT` -> `ADJUSTMENT_IN` into original source.
5. Repository locks the original row and affected location/variant balance keys.
6. Repository recomputes balances and rejects reversal if stock would become negative.
7. Repository inserts the reversal movement and copied lines as a single posted ledger entry.
8. Reads derive reversed state from the reversal linkage.

Actor identity is deferred until authentication exists. Current audit metadata is the original movement, reversal movement, reason, occurred/created/posted timestamps, optional reference pair, and idempotency key.
