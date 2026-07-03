# Inventory Allocation Policy

Inventory allocation policy is the organization-scoped configuration that decides which stock location may satisfy an inventory reservation request.

The policy model is intentionally narrow:

- `InventoryAllocationPolicy` owns immutable `code`, mutable `name`, `status`, `requireSellableLocation`, `strategy`, `version`, and timestamps.
- `InventoryAllocationPolicyLocation` stores ordered candidate stock locations with positive `priority` and `isEnabled`.
- The only strategy is `PRIORITY_ORDER`.
- Archived policies are terminal.
- Only active policies may preview allocation or allocate a reservation.

Allocation selects exactly one stock location for all requested lines. The system does not split across locations, partially allocate, substitute variants, move inventory, or create branch transfers.

## Eligibility

A policy location can be selected only when it belongs to the same organization, is enabled, has an active stock location, has an active branch, satisfies `requireSellableLocation`, is not a hold/transit location, and can satisfy every requested active variant from available-to-sell.

`QC_HOLD`, `DAMAGE_HOLD`, `RETURN_HOLD`, and `TRANSIT` are always rejected.

## Determinism

Candidate ordering is explicit:

1. Preferred location, when provided and eligible.
2. Preferred branch locations by policy priority.
3. Remaining locations by priority ascending, then stock location ID ascending.

Preview uses the same ordering but is advisory. Final allocation repeats validation and availability checks inside the reservation transaction.

## Concurrency

Allocation reuses the shared inventory advisory lock namespace:

`organizationId:stockLocationId:productVariantId`

For each candidate, variant IDs are sorted before lock acquisition. After locks are held, availability is recomputed and the first fully sufficient candidate creates one active reservation.
