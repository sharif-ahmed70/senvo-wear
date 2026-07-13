# ADR-075: Organization Membership Access

## Status

Accepted

## Decision

Authorize organization access through `OrganizationMembership` rows keyed by user and organization. A user must be active and have an active membership for the target organization.

## Rationale

Organization isolation depends on server-owned context and membership state, not request payloads. Memberships make access explicit, auditable, and extensible for role and future permission policy.

## Consequences

Duplicate memberships for the same user and organization are rejected. User and organization deletes are restricted while memberships exist. Inactive membership blocks access without deleting history.
