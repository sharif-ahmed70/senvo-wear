# Identity Foundation

SENVO Wear identity separates a person who can use the system from the organizations they may access. Authentication transport is intentionally out of scope for this foundation.

## Domain Concepts

- `User` is globally identified by email and has lifecycle status `ACTIVE`, `INACTIVE`, or `LOCKED`.
- `OrganizationMembership` links one user to one organization and carries role and membership lifecycle state.
- `Role` starts with `OWNER`, `ADMIN`, `MANAGER`, and `STAFF`.
- `Permission` is a domain type reserved for future role-to-capability policy. No detailed permission matrix is enforced yet.

## Access Flow

Adapters will eventually authenticate a caller and prepare trusted application context:

```ts
{
  userId,
  organizationId,
  role,
  requestId,
}
```

The domain validates access by loading the user and membership for the requested organization. Access is rejected when the user is inactive or locked, when the membership is inactive, or when no membership exists for that organization.

## Persistence

Identity persistence is additive:

- `users.email` is globally unique.
- `organization_memberships` has one row per `(user_id, organization_id)`.
- membership references use restrictive deletes.
- lifecycle is represented with status fields rather than hard delete.
- version fields support optimistic concurrency for role and membership status changes.

## Non-Goals

This foundation does not implement login, OAuth, JWT, sessions, cookies, password storage, password reset, email verification, API routes, frontend flows, customer accounts, or POS login.
