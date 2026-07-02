# Operational Entity Lifecycle Requirements

## Scope

Implement lifecycle and metadata management for:

- Branch
- Stock Location
- POS Counter

Non-goals:

- inventory balances
- stock movements or transfers
- stock reservations
- POS sales
- cashier shifts
- user or staff assignment
- authentication
- pricing
- orders
- payments
- HTTP endpoints
- UI

## Common Requirements

- Updates require `organizationId`, entity ID, and `expectedVersion`.
- Codes are immutable.
- Parent branch assignment is immutable for stock locations and POS counters.
- `ARCHIVED` records are terminal.
- Physical deletion is not part of lifecycle management.
- Stale writes return a concurrency error.

## Branch Requirements

- Metadata updates may change name, type, phone, email, address fields, country code, timezone, city, district, and postal code.
- Deactivation is blocked by active stock locations or POS counters.
- Archival is blocked by active or inactive stock locations or POS counters.
- No child status change is cascaded automatically.

## Stock Location Requirements

- Metadata updates may change name, type, and sellability.
- Inactive or archived stock locations must persist `isSellable = false`.
- Hold and transit location types must never persist `isSellable = true`.
- Reactivation does not restore previous sellability.

## POS Counter Requirements

- Metadata updates may change name only.
- Counter code and branch assignment are immutable.
- Future active-shift checks must be added before POS transaction workflows are implemented.
