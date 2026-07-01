# Organization Operational Structure Requirements

## Scope

Implement operational identity for:

- Branch
- Stock Location
- POS Counter

Non-goals:

- inventory balances
- stock movements
- POS sales
- cashier shifts
- user assignment
- authentication
- pricing
- orders
- UI or HTTP endpoints

## Branch Requirements

- Branch belongs to one organization.
- Branch code is normalized uppercase and unique within organization.
- Branch name is required, normalized, and not database-unique.
- Country code is an explicit two-letter value, defaulting at creation to `BD`.
- Timezone is an explicit IANA-style string, defaulting at creation to `Asia/Dhaka`.
- Deletion is restrictive.

## Stock Location Requirements

- Stock location belongs to one branch and one organization.
- Branch and stock location must belong to the same organization.
- Code is normalized uppercase and unique within organization.
- Name is required and normalized.
- `isSellable` marks whether future sale allocation may use the location.
- Hold and transit locations are non-sellable in this slice.
- No stock quantity, reservation, movement, bins, racks, or shelves are included.
- Deletion is restrictive.

## POS Counter Requirements

- POS counter belongs to one branch and one organization.
- Branch and counter must belong to the same organization.
- Code is normalized uppercase and unique within organization.
- Name is required and normalized.
- No user assignment, shift, opening cash, sale, device token, or hardware identity is included.
- Deletion is restrictive.

## Integrity

PostgreSQL must enforce organization isolation with composite foreign keys from stock locations and POS counters to branches.
