# Inventory Allocation Requirements

Inventory allocation policy supports deterministic reservation creation from configured stock locations.

## Policy

- Policies are scoped by organization.
- Policy code is unique per organization and immutable.
- Version starts at 1 and increments on metadata, status, and location replacement changes.
- Status values are `ACTIVE`, `INACTIVE`, and `ARCHIVED`.
- `ARCHIVED` is terminal.
- Strategy is `PRIORITY_ORDER`.
- `requireSellableLocation` defaults to true.

## Policy Locations

- A policy can have at most 100 locations.
- Each location must belong to the same organization as the policy.
- Each policy location priority must be a positive integer.
- Each stock location and priority may appear only once per policy.
- Disabled policy locations are ignored.
- Deletes are restrictive.

## Preview

- Inputs are organization, policy, 1 to 500 unique variant lines, and optional preferred branch/location.
- Preview validates an active policy and active variants.
- Preview returns selected location/branch, per-line selected-location availability, `canFulfill`, evaluated time, and safe failure reason.
- Preview has no stock effect and must not be trusted for final allocation.

## Allocate And Reserve

- Allocation validates the active policy, active variants, candidate eligibility, and ATS inside a transaction.
- One selected stock location must satisfy all lines.
- The workflow creates one active reservation and reservation lines.
- Same organization and idempotency key with the same payload returns the same reservation.
- Same key with a different payload is rejected.
- Concurrency must not oversell.
