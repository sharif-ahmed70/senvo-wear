# Organization Access Model

SENVO Wear treats organization access as a server-side authorization concern derived from trusted context and domain membership state.

## Trusted Context

Future adapters will authenticate a caller and prepare:

- `userId`
- `organizationId`
- `role`
- `requestId`

Application payloads must not be trusted to choose organization identity. Existing application services continue to inject `organizationId` from validated context, and the context type now has room for `userId` and `role`.

## Membership Checks

Access requires all of the following:

- the user exists
- the user status is `ACTIVE`
- the user has membership in the organization
- the membership status is `ACTIVE`

The role is carried on the membership. Fine-grained permission checks are deferred until a permission matrix is designed.

## Isolation

Membership lookup is scoped by both user and organization. A membership in one organization does not grant access to another organization.

## Lifecycle and Deletion

Identity records are disabled with status fields. Hard delete is not the operational path. Database foreign keys restrict deleting users or organizations while memberships exist.

## Explicit Non-Implementation

This model does not add login flows, password fields, token issuance, sessions, cookies, social login, or frontend behavior.
