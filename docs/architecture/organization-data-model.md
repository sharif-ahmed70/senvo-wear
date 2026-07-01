# Organization Data Model

Models added by the organization operational structure slice:

- `Branch`
- `StockLocation`
- `PosCounter`

Enums added:

- `BranchStatus`
- `BranchType`
- `StockLocationStatus`
- `StockLocationType`
- `PosCounterStatus`

## Relations

`Branch` belongs to `Organization`.

`StockLocation` belongs to both `Organization` and `Branch`. Its branch relation uses the composite foreign key `(branch_id, organization_id)` referencing `branches(id, organization_id)`.

`PosCounter` belongs to both `Organization` and `Branch`. Its branch relation also uses `(branch_id, organization_id)` to prevent cross-organization references.

## Uniqueness And Indexing

Branch:

- unique `(id, organization_id)` for composite references
- unique `(organization_id, code)`
- index `(organization_id, status)`
- index `(organization_id, type)`

Stock location:

- unique `(organization_id, code)`
- index `(organization_id, branch_id)`
- index `(organization_id, status)`
- index `(organization_id, type)`

POS counter:

- unique `(organization_id, code)`
- index `(organization_id, branch_id)`
- index `(organization_id, status)`

## Referential Actions

Foreign keys use restrictive deletes and cascading updates. Organization deletion cannot erase branches, stock locations, or counters. Branch deletion cannot erase stock locations or counters.
