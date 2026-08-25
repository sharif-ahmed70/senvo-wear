# Authentication Boundary

The authentication boundary is provider-neutral. Its workforce credential
foundation coexists with the Storefront customer implementation documented in
[Customer Authentication](customer-authentication.md).

## Domain Concepts

- IdentityProvider names the source of identity.
- UserCredential links a provider identity to the canonical User.
- AuthenticatedPrincipal represents a resolved workforce identity.
- PasswordHasher keeps password algorithms behind an infrastructure contract.
- Customer sessions use an opaque, server-managed session boundary.

## Application Boundary

Workforce application services continue to receive an authentication guard that
resolves an AuthenticatedPrincipal. Customer authentication is composed separately
for the Storefront and never creates employee membership, roles, or permissions.

## Separation From Authorization

Authentication does not evaluate permissions. Workforce authorization continues to
use user, organization, role, and permission state at the application boundary.
Customer endpoints must enforce authenticated customer and organization ownership
on the server.
