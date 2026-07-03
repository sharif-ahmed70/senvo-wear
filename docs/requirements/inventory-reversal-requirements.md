# Inventory Reversal Requirements

The system must support reversing a posted inventory movement without mutating the original ledger entry.

## Functional Requirements

- Only `POSTED` movements may be reversed.
- A reversal movement is created directly as `POSTED`.
- The original movement remains `POSTED`.
- A reversal cannot itself be reversed.
- An original movement may have at most one direct reversal.
- The client supplies only organization ID, original movement ID, reversal movement number, idempotency key, reason, occurred timestamp, and optional reference pair.
- The server derives reversal type, source, destination, lines, and quantities.
- Reversal quantities are always positive and copied from the original lines.
- Reversal attempts must preserve organization isolation.
- Reversal reads must expose original/reversal linkage.

## Non-Functional Requirements

- Reversal must be transactional.
- Concurrent duplicate reversal requests must create one ledger effect.
- Negative-stock checks must run for reversal movements that reduce stock.
- Failure must leave the original and ledger unchanged.
- No procurement, sales, reservation, costing, auth, endpoint, UI, accounting, or generic document workflow behavior is included.
