# SENVO Admin Workforce Auth — Approved Frontend Handoff

Status: **frontend approved and frozen on `design/admin-ux-system`**.

## Backend truth used

This UI binds the existing workforce authentication boundary and does not create a second authentication system.

Required upstream HTTP capability:

- `POST /admin/auth/login`
  - input: `email`, `password`, `rememberMe`
  - returns server-derived workforce principal, session token, CSRF token and expiry
- `GET /admin/auth/session`
  - Bearer session verification
  - returns display name, organization, role and permissions
- `POST /admin/auth/logout`
  - Bearer session + CSRF protected logout

Customer/storefront authentication remains separate.

## Approved UI

The sign-in surface exposes only:

- Email
- Password
- Show/hide password convenience control
- Remember me
- Sign in

Handled states:

- invalid credentials
- inactive/disabled workforce access
- rate limited authentication
- expired session
- workforce service unavailable
- signed out

Explicitly not present because the workforce HTTP contract does not expose them:

- forgot password
- workforce self-signup
- Google/social sign-in
- OTP
- SSO
- organization picker
- password reset
- decorative login metrics or account metadata

## Frontend security boundary

The browser does not store the upstream Bearer or CSRF tokens in local/session storage.

The Admin Next application provides a same-origin server boundary:

- `/api/admin-auth/login`
  - validates same-origin request
  - forwards to the existing workforce login endpoint
  - stores upstream session + CSRF values as HttpOnly, SameSite=Lax cookies
  - never returns those token values to browser JavaScript
- `/api/admin-auth/logout`
  - validates same-origin request
  - calls existing workforce logout with Bearer + CSRF
  - clears local Admin auth cookies
- `/api/admin/[...path]`
  - authenticated proxy for existing Admin API requests
  - injects Bearer session server-side
  - injects CSRF + configured upstream origin for mutations
  - clears local auth cookies on upstream 401

`apps/admin/next.config.ts` makes Admin browser API calls use `/api/admin`. Storefront browser API behavior is not changed by this Admin-only Next configuration.

## Session and permission binding

`apps/admin/app/layout.tsx` no longer opens the application with the preview Owner session. It verifies the real workforce session and renders either:

- the authenticated Admin shell, or
- the approved workforce sign-in surface.

Modern Admin routes resolve the same request-scoped workforce session and pass its actual permission list into their workspaces. This prevents a limited role from receiving preview-Owner action controls.

The Admin topbar also checks real permissions before showing `New sale` or `Receive stock`.

## Environment

Server-side Admin upstream target:

```env
SENVO_ADMIN_API_UPSTREAM_URL=http://localhost:4000
```

The proxy uses `SENVO_API_ALLOWED_ORIGIN` when present for the upstream workforce mutation-origin contract. `SENVO_ADMIN_UPSTREAM_ORIGIN` is available only as an explicit override when the existing API listener is configured with another public origin.

Production must set `SENVO_ADMIN_API_UPSTREAM_URL`; the localhost fallback is development-only.

## Integration rule

Do **not** rebuild workforce authentication in the Admin frontend. Integrate the existing workforce authentication application/HTTP implementation into the integration branch, then verify these frontend bindings against it.

The design branch intentionally does not import application, Prisma, database or HTTP-server internals.

## Integration QA gate

Run after the real workforce backend is present in the integration branch:

1. Admin lint / typecheck / build.
2. Signed-out request shows only the workforce sign-in UI.
3. Invalid credentials remain generic and do not disclose account existence.
4. Active Owner/Admin/Manager/Staff sessions render server-derived name, organization, role and permissions.
5. Navigation and page actions follow the authenticated permission set.
6. Browser storage contains no upstream Bearer/CSRF token values.
7. Admin API browser calls go through `/api/admin/...`.
8. Mutations include server-injected Bearer + CSRF upstream.
9. Expired upstream session produces the session-expired sign-in state.
10. Logout revokes upstream session when reachable and always clears local Admin auth cookies.
11. Customer/storefront authentication behavior remains unchanged.
