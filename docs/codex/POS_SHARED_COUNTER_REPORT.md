# POS shared daily counter report

Branch: `fix/pos-shared-counter`, based on local `fix/team-member-password` (`cb377fc`). Checkpoint commit: `ad9c241`. Daily cart lifecycle is the second local commit. No amendments, force-pushes, or pushes.

## Behavior

- One shared OPEN business-day session per counter; ACTIVE organization members with POS CREATE can open the counter and sell. Session/cart access is organization-scoped, with the opener name displayed.
- Checkout attributes staffId to the authenticated seller. Each successful checkout atomically marks its cart CHECKED_OUT and increments its version.
- Next Sale creates or reuses the single ACTIVE cart in the SAME session. Concurrent/retried requests return that cart. It never closes/reopens the counter and requires POS CREATE, not APPROVE.
- Cart add, quantity update, removal, and checkout require expectedVersion. Stale writes return HTTP 409 with ?Cart changed on another screen. Refresh.? The selling screen provides a Refresh action.
- Close/settle requires POS APPROVE (OWNER/ADMIN/MANAGER defaults; STAFF receives 403). A nonempty ACTIVE cart blocks closing/settlement. Session locks serialize cart creation/edits/checkouts with settlement. Empty carts become ABANDONED on close.
- Reconciliation/Z-report aggregates the whole session: all checkouts, payment lines, later collections, refunds, and returns. Seller breakdown uses checkout staffId. Return credits reduce seller net sales; payment refunds are shown separately. Digital collections/refunds now contribute to their corresponding expected channel balances.
- Historical carts and closed sessions remain readable. Existing idempotency replay, price/stock validation, reservation, payment execution, receipt, and tenant isolation behavior is retained. No storefront, procurement, stock-intake, or sidebar changes.

## Migrations and local database

- `202610020002_pos_shared_counter_approval`: additive missing permission/role-permission inserts; no deletes.
- `202610020003_pos_daily_session_carts`: cart status/version with defaults, historical status backfill, and replacement of the session/cart unique index with an ACTIVE-only partial unique index. No row deletes; checkout links retained.

Applied to local development database `senvo_wear_dev` on `127.0.0.1:5432`, only after pg_dump custom-format backups and successful pg_restore --list validation:

- `C:\SENVO_TRANSFER\DATABASE\pre-pos-shared-counter-20261002-161516.dump` (414202 bytes).
- `C:\SENVO_TRANSFER\DATABASE\pre-pos-daily-carts-20261002-174433.dump` (414379 bytes).

Daily migration retained all five existing dev carts; all five have CHECKED_OUT status and valid versions. Migrations also applied to the isolated local integration database `senvo_wear_ci_test`; integration cleanup never ran against dev.

## Verification

- All touched-package typechecks pass: Admin, HTTP, API, application, contracts, database, domain.
- Unit tests pass: domain 374, database 74, application 244, API 113, contracts 54, HTTP 109, Admin 358. Database unit runs skip integration suites unless the test URL is supplied.
- POS database integration: 28/28 pass. Coverage includes three sales/two sellers in one session, persisted seller IDs, whole-day/per-seller totals including collections/returns/refunds, one-active-cart constraint, concurrent Next Sale, stale add/update/remove/checkout, nonempty settlement blocking, settlement/edit race, tenant isolation, historical closed-session reads, and idempotent replay after close.
- HTTP tests verify stale cart 409 with the exact refresh message, STAFF Next Sale success, and STAFF close/settle 403. API authorization tests cover MANAGER/ADMIN/OWNER settlement permission.
- Admin production build passes (exit 0).
- Full lint was run for all touched packages. Existing failures remain in contracts, domain, database, application, API, and HTTP (primarily procurement/shipping fixtures and pre-existing unsafe test types); Admin lint passes with warnings. New lint findings were corrected; targeted lint for the modified settlement use case, cart locking, settlement repository, and POS integration tests passes.
- Final repository format and boundary gate results are recorded below before commit.

## Open items

Existing repository-wide lint failures remain; this branch does not clean unrelated code. No functional scope items are intentionally deferred. No remote push was performed.

## Files changed across both commits

- `apps/admin/app/_lib/admin-access.ts`
- `apps/admin/app/_lib/api-client.ts`
- `apps/admin/app/api-client.test.ts`
- `apps/admin/app/pos/_components/pos-management-workspace.tsx`
- `apps/admin/app/pos/sell/_components/payment-panel.tsx`
- `apps/admin/app/pos/sell/_components/pos-sale-workspace.tsx`
- `apps/admin/app/pos/sell/_components/selling-context-selector.tsx`
- `apps/admin/app/pos/sell/_lib/pos-error-messages.test.ts`
- `apps/admin/app/pos/sell/_lib/pos-error-messages.ts`
- `apps/admin/app/pos/sell/_lib/reconcile-next-sale.test.ts`
- `apps/admin/app/pos/sell/_lib/reconcile-next-sale.ts`
- `apps/admin/app/pos/sell/pos-sale-components.test.tsx`
- `apps/admin/app/pos/sessions/[id]/z-report/z-report-preview.tsx`
- `apps/admin/app/pos/sessions/_components/register-settlement-modal.tsx`
- `apps/admin/app/pos/sessions/settlement.test.tsx`
- `docs/codex/POS_SHARED_COUNTER_REPORT.md`
- `packages/api/src/pos-handlers.test.ts`
- `packages/api/src/pos-handlers.ts`
- `packages/application/src/pos/pos-application-service.test.ts`
- `packages/application/src/pos/pos-application-service.ts`
- `packages/contracts/src/index.test.ts`
- `packages/contracts/src/index.ts`
- `packages/database/prisma/migrations/202610020002_pos_shared_counter_approval/migration.sql`
- `packages/database/prisma/migrations/202610020003_pos_daily_session_carts/migration.sql`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/authorization/role-permission-matrix-migration.test.ts`
- `packages/database/src/pos/cart-lock.ts`
- `packages/database/src/pos/checkout-repository.ts`
- `packages/database/src/pos/repository.integration.test.ts`
- `packages/database/src/pos/repository.ts`
- `packages/database/src/pos/settlement-repository.test.ts`
- `packages/database/src/pos/settlement-repository.ts`
- `packages/domain/src/authorization/application/role-permission-policy.test.ts`
- `packages/domain/src/authorization/application/role-permission-policy.ts`
- `packages/domain/src/pos/application/checkout-use-cases.test.ts`
- `packages/domain/src/pos/application/checkout-use-cases.ts`
- `packages/domain/src/pos/application/pos-use-cases.test.ts`
- `packages/domain/src/pos/application/pos-use-cases.ts`
- `packages/domain/src/pos/application/settlement-use-cases.test.ts`
- `packages/domain/src/pos/application/settlement-use-cases.ts`
- `packages/domain/src/pos/domain/models.ts`
- `packages/domain/src/pos/domain/reconciliation-rules.ts`
- `packages/domain/src/pos/repositories/pos-checkout-repository.ts`
- `packages/domain/src/pos/repositories/pos-repository.ts`
- `packages/domain/src/pos/repositories/pos-settlement-repository.ts`
- `packages/http/src/node-http-adapter.test.ts`
- `packages/http/src/node-http-adapter.ts`
