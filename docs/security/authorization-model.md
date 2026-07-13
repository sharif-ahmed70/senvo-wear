# Authorization Model

Authorization is evaluated from trusted server-side context plus identity membership state. Callers do not supply organization identity in application payloads.

## Trusted Context

Future authenticated adapters should prepare:

```ts
{
  userId,
  organizationId,
  role,
  requestId,
  permissions?,
}
```

`permissions` is optional and may be used by a trusted adapter or policy loader. When omitted, the authorization service can fall back to repository-backed role grants or the initial default role policy.

## Permission Decision

A permission request is a `{ resource, action }` pair. The service returns success or throws an `AuthorizationError`.

Access is denied for:

- inactive or locked users
- inactive memberships
- missing organization membership
- role mismatch between context and membership
- missing permission grant

## Isolation

Membership lookup is scoped by both `userId` and `organizationId`. A role in one organization never grants access to another organization.

## Current Non-Goals

This foundation does not implement login UI, OAuth, JWT, sessions, cookies, API routes, frontend authorization, password recovery, email verification, customer accounts, payment authorization, or POS login.
