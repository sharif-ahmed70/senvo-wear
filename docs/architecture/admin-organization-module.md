# Admin Organization and Team Module

## Purpose

This module gives business owners and store managers one understandable place to maintain business details, stores, team members, and role visibility. The admin application uses business terms while the domain keeps its established organization, branch, identity, and authorization models.

## Boundaries

The admin application calls the typed HTTP API only. It does not import domain repositories or Prisma. The request pipeline validates strict contracts, authenticates the actor, authorizes the operation, and then calls `OrganizationApplicationService`.

The service derives the organization from trusted application context. Browser payloads cannot select an organization, user identity, actor role, or actor access list.

## Business Mapping

- Store is the admin term for the existing branch aggregate.
- Team member is the admin term for a user with organization access.
- Role is a fixed business responsibility: Owner, Admin, Manager, or Staff.
- Access details are a friendly projection of active role capabilities.

These translations are presentation concerns. Existing domain rules, optimistic concurrency, organization isolation, and restrictive deletion remain authoritative.

## Profile

The organization record owns business name, immutable business code, country, timezone, contact information, address, and a version. Profile updates are organization scoped and use optimistic concurrency.

## Stores

Store creation and updates reuse organization branch use cases. Codes are normalized and unique within an organization. Store codes are immutable after creation. Activation and deactivation reuse the existing lifecycle rules and do not cascade to child records.

## Team

Adding a team member creates a user only when the email is not already registered, then grants access to the current organization. No credential, password, invitation delivery, or login flow is created. Status and role changes use the existing versioned identity operations.

The current foundation reports `All stores` because access is organization wide. Per-store team assignment requires a separate domain decision and data model.

## Security

Organization profile and store reads require `ORGANIZATION.READ`; writes require `ORGANIZATION.UPDATE`. Team and role reads require `TEAM.READ`; changes require `TEAM.UPDATE`.

A requested target role is validated as operation data. It never replaces the authenticated actor role or trusted access context. Backend authorization remains final authority, and UI visibility is convenience only.

## Failure Handling

All pages include loading, empty, error, and success states. API errors retain request IDs for support without exposing stack traces or infrastructure details.
