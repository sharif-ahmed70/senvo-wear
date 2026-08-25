# Customer Authentication Security

## Trust Boundaries

- Organization is resolved from server configuration, never request input.
- Public registration cannot submit role, membership, permissions, user ID, or
  organization ID because shared contracts are strict.
- Customer status and global user status are checked on every session use.
- Staff membership and customer account access are independent.

## Credential and Token Protection

- Passwords are stored as salted scrypt hashes.
- Sessions, OTPs, verification links, reset links, and OAuth state are generated
  with Node cryptographic randomness.
- Only HMAC hashes of opaque secrets are persisted.
- Challenge consumption uses an atomic status/attempt comparison, preventing replay.
- Password replacement and session revocation use one database transaction.
- Provider linking checks identity ownership before linking and relies on a unique
  provider/identifier constraint for races.

## Browser Protection

- Session cookies are HttpOnly, SameSite=Lax, path /, and Secure in production.
- Mutations require the exact Storefront origin.
- Authenticated mutations additionally require a session-bound CSRF value.
- Browser responses never include raw session or CSRF tokens.
- Return URLs accept only same-origin relative paths.
- Google account-creation consent is bound to the persisted one-time OAuth
  challenge; the browser OAuth cookie cannot elevate that decision.
- Auth responses are no-store and never expose stack traces.

## Abuse Controls

Registration, login, OTP request/verification, password reset, and verification
requests consume organization-scoped persistent rate-limit counters keyed by an HMAC
of the normalized identifier. Counter increments use optimistic concurrency. OTPs
expire after ten minutes, have a one-minute resend cooldown, allow five attempts,
invalidate previous active challenges, and are single use.

Forgot-password responses are deliberately generic. Unknown and wrong password
logins use the same message and execute password verification against a fallback
hash.

## External Gates

Google credentials, transactional email delivery, and SMS delivery are operational
configuration gates. Until provider-specific email/SMS adapters are injected, the
application explicitly reports delivery unavailable and never simulates successful
delivery.
