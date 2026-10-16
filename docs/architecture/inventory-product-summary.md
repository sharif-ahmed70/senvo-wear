# Product inventory summary read API

## Audit and reuse

The existing inventory read contract exposes variant/location availability, location
listing, movement history and individual variant availability. It has no product
summary or low-stock threshold. The existing availability repository derives stock
from POSTED movement lines and reservations whose status is ACTIVE. Its result
starts from ledger/reservation pairs, so it omits never-stocked variants.

The new product summary reuses that SQL through `availabilityCtes`; it does not
introduce a balance table or change movement, reservation or checkout behavior.
Existing endpoint contracts, ordering and inclusion behavior remain unchanged.

## Request

`GET /inventory/products`

Requires authenticated organization context and `INVENTORY.READ`. Client-supplied
organization IDs are rejected. Optional query parameters:

- `pageSize`: 1 to 100, default 25.
- `cursor`: opaque continuation cursor returned by the previous page.
- `search`: product name, product code or variant SKU (maximum 120 characters).
- `locationId`: restrict quantities to this location, while still including zero-stock products.
- `lowStockThreshold`: integer 0 to 2147483647, applied to each product's available quantity.

Products are paginated by product code and ID, before variants and locations are
joined. A single SQL statement provides consistent totals and breakdowns from one
snapshot. Searching a SKU selects its product with ALL variants, not just that SKU.
Keep the same filters when following cursors. All product/variant statuses and all
location types are included, matching the operational scope of inventory reads.
A location belonging to another organization contributes no quantities or metadata.

## Response

The existing API envelope wraps `{ items, hasMore, nextCursor }`. Each item has:

- `product`: `{ id, name, productCode }`.
- `onHand`, `reserved`, `availableToSell`: sums across the selected locations and variants.
- `variants`: each has the existing variant identity projection, the same quantities,
  and its `locations` breakdown.
- `locations`: quantities summed across the product's variants for each location.
- `lowStockThreshold`, `isLowStock`: null when no threshold was supplied; otherwise
  `isLowStock` is true when product available quantity is less than or equal to the threshold.

A never-stocked variant has zero totals and an empty locations array. A product
without variants has zero totals and empty breakdown arrays. Locations with ledger
history remain visible even when their balance reaches zero. This endpoint does
not generate every possible zero-valued variant/location combination.

Available quantity is on hand minus ACTIVE reservations. Negative availability is
preserved. Expiry dates alone do not remove ACTIVE reservations. Availability at
non-sellable locations is an operational quantity, not a promise of checkout eligibility.

The threshold is request-scoped, not saved configuration, and is a product-total
indicator rather than a per-size replenishment rule. No schema migration or write
endpoint is introduced. Product imagery and pricing remain available through the
existing catalog APIs. Valuation and movement-engine concerns are outside this change.

## Verification

Unit tests cover projection totals, zero-stock products, threshold boundaries,
negative availability, validation, authorization and HTTP routing. PostgreSQL
integration coverage in `inventory/repositories.integration.test.ts` checks ledger
parity, transfers, active/released reservations, ignored drafts, complete product
pagination, SKU search, location scoping and tenant isolation. The integration
suite requires an explicitly configured safe `TEST_DATABASE_URL`.
