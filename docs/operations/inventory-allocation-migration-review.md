# Inventory Allocation Migration Review

Migration: `202607030005_add_inventory_allocation_policy`

## Scope

The migration is additive. It creates:

- `InventoryAllocationPolicyStatus`
- `InventoryAllocationStrategy`
- `inventory_allocation_policies`
- `inventory_allocation_policy_locations`

## Constraints

- Policy code is unique per organization.
- Policy has a positive version check.
- Policy location priority is positive.
- Policy location is unique by policy/location and policy/priority.
- Policy location has same-organization composite foreign keys to policy and stock location.
- All referential actions use restrictive deletion and cascade update.

## Indexes

- Policy lookup/list: `organization_id`, `status`, `created_at`, `id`.
- Policy-location ordering: `organization_id`, `policy_id`, `priority`.
- Policy-location reverse lookup: `organization_id`, `stock_location_id`.

## Drift Review

Expected drift result after deploy/reset/reapply is no difference detected. No previous migration is edited by this change.
