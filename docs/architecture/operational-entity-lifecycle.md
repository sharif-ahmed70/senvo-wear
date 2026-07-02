# Operational Entity Lifecycle

Branches, stock locations, and POS counters use the same status vocabulary:

- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

Allowed transitions:

- `ACTIVE -> INACTIVE`
- `ACTIVE -> ARCHIVED`
- `INACTIVE -> ACTIVE`
- `INACTIVE -> ARCHIVED`

`ARCHIVED` is terminal in this phase. Archived records are preserved and cannot be reactivated or changed to inactive.

## Metadata Updates

Branch metadata updates may change display/contact/address fields, country code, timezone, and branch type. Branch code is immutable.

Stock location metadata updates may change name, type, and sellability. Stock location code and branch assignment are immutable.

POS counter metadata updates may change name only. POS counter code and branch assignment are immutable.

Nullable branch fields use this clearing policy:

- omitted: unchanged
- `null`: clear
- string: normalize and replace

## Branch Blockers

A branch may become `INACTIVE` only when it has no active stock locations and no active POS counters.

A branch may become `ARCHIVED` only when all stock locations and POS counters under it are already archived.

Child statuses are not cascaded automatically.

## Stock Location Sellability

Inactive and archived stock locations are always non-sellable.

Changing a stock location to `INACTIVE` or `ARCHIVED` atomically persists `isSellable = false`. Reactivating a location does not restore previous sellability.

`QC_HOLD`, `DAMAGE_HOLD`, `RETURN_HOLD`, and `TRANSIT` locations cannot be sellable. PostgreSQL enforces this with a check constraint.

## Optimistic Concurrency

Branches, stock locations, and POS counters include an integer `version`. Update and status-change use cases require `expectedVersion`. Repository updates match `id + organizationId + version` and increment version atomically.

If the version does not match, the application returns a stable concurrency error.

Branch blocker checks and status updates are performed as focused application steps with the database enforcing the versioned branch update. A concurrent child activation between the blocker check and branch update remains a known future hardening point; future child activation use cases must also check parent branch lifecycle state.
