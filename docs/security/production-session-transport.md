# Production Session Transport

Admin and POS authenticate with an active PASSWORD credential plus an active
organization membership. Successful login creates an opaque random session;
only its SHA-256 hash is stored. Password hashes use the versioned scrypt
format implemented by `ScryptPasswordHasher`.

The browser receives an HttpOnly, SameSite=Strict cookie. Production cookies
are always Secure. Session expiry is eight hours, logout revokes immediately,
and every protected request rechecks user, organization, and membership state.
The request context derives user, organization, role permissions, and actor
identity from the server-side session. Browser identity, organization, role,
and permission input is ignored.

Credentialed browser origins must exactly match `SENVO_ALLOWED_ORIGINS`.
Unapproved origins are rejected before login or business handlers execute.
Session start/end writes append-only audit entries in the same transaction as
session persistence or revocation. Passwords, raw session tokens, and secrets
are never audited.

Development header authentication remains test/development-only and throws
when constructed for production.
