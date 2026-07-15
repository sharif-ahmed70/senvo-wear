# Authentication Boundary

The authentication boundary is a provider-neutral domain and application seam for future sign-in flows.

## Domain Concepts

- `IdentityProvider` names the source of identity.
- `UserCredential` links provider identifier to `User`.
- `AuthenticatedPrincipal` represents a resolved user identity.
- `PasswordHasher` is an interface only; this foundation does not choose an algorithm or store plaintext passwords.
- `AuthenticationSessionBoundary` documents where a future session mechanism may connect without implementing one.

## Application Boundary

Application services may receive an authentication guard:

```ts
authenticate(request) => AuthenticatedPrincipal
```

The current implementation demonstrates that boundary on sales order creation. When no authentication service is injected, existing trusted internal calls continue to work.

## Separation From Authorization

Authentication does not load memberships or evaluate permissions. Authorization continues to use user, organization, role, and permission state at the application boundary.
