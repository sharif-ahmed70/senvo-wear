# POS shared counter implementation report

Branch: `fix/pos-shared-counter`, created from local `fix/team-member-password` at `cb377fc`. No commits, amendments, or pushes made.

Status: partial implementation; not ready for shop use until the daily-session/cart lifecycle decision is resolved.

## Implemented

- Existing POS CREATE session-opening authorization remains available to STAFF.
- Organization-scoped open sessions and carts are shared across staff; the one-open-session-per-counter constraint is unchanged.
- Checkout preparation uses the authenticated seller and that seller's organization membership. Checkout staff attribution and receipt seller name no longer come from the opener.
- POS APPROVE gates close, settlement, cash reconciliation, and Z-report access. Default OWNER, ADMIN, and MANAGER roles receive the permission; STAFF does not.
- Selling shows the opener name. Session actions and Z-report access follow POS APPROVE. Sidebar and page styles are unchanged.
- Tenant scoping, checkout locking, idempotency, current prices, inventory checks, and existing session version checks are preserved.

## Migration and backup

Migration: `202610020002_pos_shared_counter_approval`.

This only inserts missing permission and role-permission rows with ON CONFLICT DO NOTHING; no deletes or updates.

Applied to local development database `senvo_wear_dev` at `127.0.0.1:5432` after a successful custom-format pg_dump and pg_restore --list validation.

Backup: `C:\SENVO_TRANSFER\DATABASE\pre-pos-shared-counter-20261002-161516.dump` (414202 bytes).

## Remaining work / scope decision

The existing schema has one cart per session and one checkout per cart. The current Next Sale action closes and reopens the session. Consequently STAFF cannot start the next sale after the new close restriction. Supporting one shared business-day session requires changing that cart lifecycle/schema while retaining checkout history and retry behavior. A scope question is pending; this dependent change has not been made.

There is no existing cart version field or expectedVersion in cart edit/checkout contracts on the requested base branch. Only counter/session version checks exist. A stale-cart conflict regression cannot honestly pass without adding cart concurrency validation. This is still outstanding.

## Verification

- Touched-package typechecks: pass (Admin, API, application, contracts, database, domain).
- Unit tests: domain 374, contracts 54, database 74, application 244, API 113, Admin 360 pass. Database unit run skips integration tests without TEST_DATABASE_URL.
- POS database integration: all 23 pass against the existing isolated local `senvo_wear_ci_test` database, including STAFF checkout of an OWNER-opened cart with staffId verified in the persisted checkout row.
- API regressions cover STAFF denial and MANAGER/ADMIN/OWNER approval for close, settle, and reconciliation; opener display and Z-report denial have UI coverage.
- Admin production build: pass, verified process exit 0.
- pnpm boundary:check and pnpm format:check: pass.
- Full package lint has existing failures in domain, database, application, API, and contracts (shipping, procurement, settlement tests, and an unused contracts test import). Admin lint has warnings only. Changed POS repository/domain/API files passed targeted lint.
- Stale-cart concurrency and repeated sales within one daily session are not implemented or claimed as passing.

## Files changed

- `apps/admin/app/_lib/admin-access.ts`
- `apps/admin/app/pos/_components/pos-management-workspace.tsx`
- `apps/admin/app/pos/sell/_components/selling-context-selector.tsx`
- `apps/admin/app/pos/sell/pos-sale-components.test.tsx`
- `apps/admin/app/pos/sessions/[id]/z-report/z-report-preview.tsx`
- `apps/admin/app/pos/sessions/settlement.test.tsx`
- `packages/api/src/pos-handlers.test.ts`
- `packages/api/src/pos-handlers.ts`
- `packages/application/src/pos/pos-application-service.test.ts`
- `packages/application/src/pos/pos-application-service.ts`
- `packages/contracts/src/index.ts`
- `packages/database/src/authorization/role-permission-matrix-migration.test.ts`
- `packages/database/src/pos/checkout-repository.ts`
- `packages/database/src/pos/repository.integration.test.ts`
- `packages/database/src/pos/repository.ts`
- `packages/domain/src/authorization/application/role-permission-policy.test.ts`
- `packages/domain/src/authorization/application/role-permission-policy.ts`
- `packages/domain/src/pos/application/checkout-use-cases.ts`
- `packages/domain/src/pos/application/pos-use-cases.test.ts`
- `packages/domain/src/pos/domain/models.ts`
- `packages/domain/src/pos/repositories/pos-checkout-repository.ts`
- `packages/domain/src/pos/repositories/pos-repository.ts`
- `packages/database/prisma/migrations/202610020002_pos_shared_counter_approval/migration.sql`
