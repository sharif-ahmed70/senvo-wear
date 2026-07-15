# Authentication Model

Authentication identifies a user. Authorization decides what that user can do.

## Boundary

SENVO Wear keeps authentication provider concerns outside application and domain workflows. Future adapters can authenticate a request and produce:

```ts
{
  authenticatedUserId,
  organizationId?,
  requestId,
}
```

The optional `organizationId` is selection context only. Organization access and permissions remain authorization concerns.

## Credentials

Credentials link an identity provider and provider identifier to a SENVO user. Supported foundation providers are:

- `PASSWORD`
- `GOOGLE`
- `MICROSOFT`

Password credentials store only `passwordHash`. Plaintext passwords, raw credentials, provider tokens, cookies, and sessions are not stored by this foundation.

## Lifecycle

Credentials use `ACTIVE` and `INACTIVE` status. Users must also be `ACTIVE` before an authenticated principal can be produced.

## Non-Goals

This foundation does not implement login UI, OAuth, Google login, social login, JWT tokens, cookies, sessions, API routes, password reset, or email verification.
