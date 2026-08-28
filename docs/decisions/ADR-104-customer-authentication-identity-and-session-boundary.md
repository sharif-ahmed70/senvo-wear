# ADR-104: Customer Authentication Identity and Session Boundary

## Status

Accepted

## Context

SENVO needs password, passwordless, phone, and Google customer access without
granting Storefront users employee roles or duplicating canonical users. Browser
credentials must remain revocable and provider-neutral.

## Decision

Keep User as canonical identity and add an organization-scoped CustomerAccount.
Continue storing provider identities in UserCredential. Public registration can
create only these customer records and cannot create OrganizationMembership.

Use server-managed opaque sessions whose token and CSRF hashes are persisted.
Represent OTP, verification, reset, and OAuth state as typed one-time challenges.
Resolve the Storefront organization from server configuration. Keep email, SMS, and
Google behind infrastructure interfaces.

Verified Google email may locate an existing customer, but the Google subject is
linked only when unowned or already owned by that same canonical user.

## Consequences

Customer and workforce interfaces remain separate while sharing canonical identity.
Sessions can be revoked per device or globally. Authentication requires PostgreSQL
and configured delivery providers for complete operation. A future customer-cart
model must define an explicit merge policy; current local guest carts remain
untouched across authentication.
