# Organization Operational Structure

This slice adds operational identity for branches, stock locations, and POS counters. It does not add inventory balance, stock movement, POS sale, cashier, device, authentication, pricing, order, or UI behavior.

## Branch

`Branch` represents an operational business unit such as a showroom, warehouse, office, fulfilment branch, or hybrid branch.

Branch names are display labels and may repeat inside one organization. Branch codes are operational identifiers and are unique within one organization.

Country and timezone defaults are applied by the create use case as explicit persisted values:

- `countryCode`: `BD`
- `timezone`: `Asia/Dhaka`

The address fields are intentionally generic street/city/district/postal/country fields, not a hard-coded Bangladesh-only structure.

## Stock Location

`StockLocation` represents a physical or controlled logical place where inventory may later be held. It is identity only; it does not store stock quantity, reserved quantity, movement history, bin/rack hierarchy, or ledger state.

Stock location code uniqueness is organization-wide. A stock location belongs to a branch, and PostgreSQL enforces that the branch belongs to the same organization.

Sellable defaults:

- `SHOWROOM`: sellable by default
- `WAREHOUSE`: non-sellable by default, but may be configured sellable
- `QC_HOLD`, `DAMAGE_HOLD`, `RETURN_HOLD`, `TRANSIT`: non-sellable and cannot be marked sellable in this slice
- `OTHER`: non-sellable by default

## POS Counter

`PosCounter` represents a selling counter identity inside a branch. It does not include cashier assignment, shifts, opening cash, sales, hardware ID, device tokens, or payment state.

POS counter code uniqueness is organization-wide for operational simplicity. PostgreSQL enforces that the referenced branch belongs to the same organization.

## Lifecycle

Branches, stock locations, and POS counters use `ACTIVE`, `INACTIVE`, and `ARCHIVED` statuses. Restrictive foreign keys prevent accidental cascade deletion. Lifecycle workflows should prefer status changes once dependent business records exist.
