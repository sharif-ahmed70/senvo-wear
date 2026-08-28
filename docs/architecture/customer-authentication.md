# Customer Authentication

## Boundary

Customer authentication is a Storefront capability composed through the existing
domain, application, database, HTTP, and Storefront packages. React components
never access Prisma, password hashes, session tokens, OTP secrets, or OAuth client
secrets.

The canonical User remains global. CustomerAccount adds the organization-scoped
customer profile and lifecycle. Public registration creates a customer account and
credential only; it never creates an organization membership, role, or permission.
Admin and staff authentication/authorization remain separate.

## Sign-In Methods

- Password credentials use Node scrypt with per-password random salt.
- Email and phone codes share one challenge service and provider-neutral message
  contract.
- Google uses Authorization Code with PKCE, persisted one-time state, and verified
  Google email. A provider identity can only be reused by its canonical owner.
- Additional providers can implement the existing identity/provider boundaries.

Email and SMS delivery intentionally report UNAVAILABLE until a production
provider is injected. No code or reset token is printed, logged, or returned by the
API.

## Sessions

The browser receives an opaque session in an HttpOnly cookie and a separate CSRF
value in a readable cookie. Only keyed hashes are stored in PostgreSQL. Normal
sessions last 12 hours; remembered sessions last 30 days. Logout revokes one
session, logout-all revokes every active customer session, and password reset
replaces the password and revokes active sessions in one repository transaction.

## Commerce

The current Storefront cart remains guest-owned local storage. Authentication does
not clear, replace, or rewrite it, so variants and quantities survive every sign-in
flow. A server-cart merge policy is deliberately deferred until a customer cart is
introduced; this avoids inventing an unsafe overwrite rule.

The account page is a client-rendered protected shell. It contains no private
server-rendered data and redirects anonymous visitors to a safe login return URL.
All customer data APIs must still authenticate the opaque session and enforce
organization plus customer ownership server-side.

## Runtime

The development API enables customer authentication only when AUTH_SECRET is
present. Google is enabled only when all Google variables are configured. Production
composition must inject real email/SMS adapters and set secure cookies.
