# SENVO Wear AI Context

- **Purpose:** Compact, authoritative onboarding context for an AI coding assistant.
- **Snapshot:** August 2026, after the Storefront Commerce MVP production correction.
- **Repository:** `sharif-ahmed70/senvo-wear`

## 1. Project Identity

SENVO Wear is a TypeScript/PostgreSQL modular-monolith ERP and omnichannel commerce platform for a clothing business. It unifies organization/team access, catalog, barcodes, inventory, reservations, sales orders, stores, event booths, POS, payments, receipts, returns, refunds, audit history, and a public guest Storefront.

The current system is a strong pre-production foundation and commerce MVP, not a fully deployed product. Production authentication, online payment gateways, courier integration, customer accounts/CRM, analytics, and hardware drivers remain future work.

## 2. Architecture in One View

```text
Admin | POS | Storefront
          |
          v
Node HTTP adapter
          |
          v
Transport-independent API handlers
          |
          v
Application services / transactions / authorization / audit
          |
          v
Domain use cases / policies / repository contracts
          |
          v
Prisma repository infrastructure
          |
          v
PostgreSQL 17
```

The system is a pnpm/Turborepo monorepo with Next.js applications. Domain-driven boundaries are more important than framework convenience.

## 3. Package Ownership

| Path                   | Responsibility                                               |
| ---------------------- | ------------------------------------------------------------ |
| `apps/admin`           | Owner/staff operational UI and typed API client              |
| `apps/pos`             | Dedicated POS client boundary                                |
| `apps/storefront`      | Public catalog, guest bag, COD checkout                      |
| `packages/domain`      | Invariants, use cases, value objects, repository contracts   |
| `packages/application` | Workflow orchestration, trusted context, transactions, audit |
| `packages/database`    | Prisma schema/client, repositories, SQL locks, migrations    |
| `packages/contracts`   | Strict API schemas and DTOs                                  |
| `packages/api`         | Transport-independent validation/auth/error handlers         |
| `packages/http`        | Thin Node HTTP runtime adapter                               |
| `packages/ui`          | Business-neutral shared UI primitives                        |
| `packages/config`      | Shared tooling configuration                                 |
| `packages/logger`      | Safe structured logging boundary                             |
| `packages/storage`     | Future provider-neutral object storage                       |
| `packages/testing`     | Shared test helpers                                          |
| `packages/utils`       | Generic utilities only                                       |

## 4. Non-Negotiable Architecture Rules

1. Business rules belong in domain/application boundaries, never controllers or UI components.
2. Prisma types and database clients stay inside database infrastructure.
3. Browser applications do not import domain repositories, application services, Prisma, or database packages.
4. API handlers validate strict contracts before invoking application services.
5. HTTP adapters own protocol mechanics only.
6. Use existing package exports and patterns; do not deep-import another package's internals.
7. Do not add an abstraction unless it removes real complexity or follows an established boundary.
8. Do not introduce a microservice, queue, or event bus without an explicit approved milestone.

## 5. Trust and Security Rules

- `organizationId`, `userId`/actor identity, role, permissions, authentication state, source, and request ID come from trusted execution context.
- Never accept trusted identity or permission facts from a normal browser payload.
- Backend authorization is authoritative; UI permission checks only control visibility.
- Repository reads/writes must be organization scoped. Composite foreign keys defend cross-tenant relationships.
- Cross-organization access should not reveal record existence.
- Development header authentication is never a production mechanism.
- Do not log or audit passwords, tokens, idempotency keys, raw payloads, stack traces, SQL, PAN, CVV, PIN, OTP, payment credentials, or unnecessary PII.
- Public errors use stable safe codes/messages and request IDs.

## 6. Sources of Truth

- Catalog records own product, variant, SKU, color, size, and barcode identity.
- Current server-side variant price owns selling price.
- Posted immutable inventory movement lines own on-hand stock.
- Active reservation lines own reserved quantity.
- `ATS = posted on-hand - active reserved`.
- Sales orders and immutable line snapshots own commercial history.
- Payment batches own checkout-time tenders.
- Payment collections own later received money.
- Completed returns own merchandise credit.
- Refund events own confirmed issued refunds.
- Immutable receipts own historical customer/staff documents.
- Audit entries own controlled action history.
- Browser localStorage, UI totals, and read models are never transactional sources of truth.

## 7. Core Domain Rules

### Organization and identity

- A user is global and may have memberships in multiple organizations.
- User and membership must both be active for organization access.
- Roles are OWNER, ADMIN, MANAGER, and STAFF; permissions are resource/action grants.
- Operational codes are generally immutable; archived terminal states are not silently reactivated.

### Inventory

- Posted movements and lines are immutable.
- Corrections use compensating movements.
- Negative on-hand is prohibited.
- Reservations do not change on-hand.
- Confirming a reservation does not issue stock.
- Fulfillment consumes the reservation and posts inventory movement.
- Final allocation is transaction-revalidated under shared locks.
- Allocation is deterministic and single-location; no implicit split or partial fulfillment.

### Sales

- Money is integer minor units; never use floating point for stored calculations.
- Order lifecycle: DRAFT -> RESERVED -> CONFIRMED -> FULFILLED, with controlled cancellation.
- Only DRAFT orders are amendable and require expected-version concurrency.
- Channels are ONLINE, OFFLINE_STORE, and EVENT_BOOTH; event orders require the correct booth.
- Historical line/catalog snapshots are immutable.

### POS, payment, return, and refund

- A cashier may use only the session/cart owned by the authenticated user.
- Checkout reloads transaction-fresh catalog, price, stock, source, and staff facts.
- Checkout, order, reservation consumption, payment, receipt, and audit commit atomically.
- Collections, returns, and refunds serialize on the checkout row.
- Financial and merchandise history is append only; original payments and receipts are not rewritten.
- Returned stock enters active non-sellable RETURN_HOLD via ADJUSTMENT_IN.
- Return credit and refund settlement use integer cumulative calculations.
- Current refunds record staff-confirmed external issuance; they do not execute provider refunds.

### Storefront

- Public organization is resolved server-side from `STOREFRONT_ORGANIZATION_CODE`.
- Browser bag persistence contains only `productVariantId` and `quantity`.
- Legacy/stale bag metadata is discarded; current server catalog hydrates all display facts.
- Checkout cannot submit until current price and availability hydration succeeds.
- Reviewed price is comparison input only. Current server price is authoritative.
- A price mismatch is rejected before any order/profile/reservation/audit write.
- COD is a payment preference and does not create a payment record.
- `NEXT_PUBLIC_SENVO_API_URL` is required; there is no production localhost fallback.
- Uncertain retries preserve the same idempotency key for unchanged normalized input.

## 8. Transaction and Idempotency Rules

- Use one explicit outer transaction for a coordinated business operation.
- Inject transaction-scoped repositories; do not open hidden or nested transactions.
- Reload mutable facts after acquiring the relevant row/advisory lock.
- Acquire multi-key inventory locks in deterministic order.
- Use normalized payload signatures with scoped idempotency keys.
- Identical retry returns the existing result; same key with different normalized details conflicts.
- A replay must not duplicate stock, order, payment, receipt, return, refund, or audit records.
- Business and integrated audit writes commit or roll back together.

## 9. Database Rules

- PostgreSQL and reviewed Prisma migrations are authoritative.
- Current snapshot contains exactly 23 migrations.
- Use application-generated UUIDs unless a current ADR explicitly says otherwise.
- Schema changes require a new additive migration.
- Never edit a previously published migration.
- Never use production `prisma db push`.
- Preserve restrictive deletes, organization composite keys, uniqueness, lifecycle checks, and version fields.
- Generated client and build outputs are not source changes.
- Database work is incomplete until deploy/status, integration tests, reset/reapply, and exact clean drift pass.

## 10. Current Capability Snapshot

Completed foundations:

- organization, stores, locations, team, membership, roles, and permissions;
- authentication boundary and trusted runtime context;
- append-only audit and transactional audit;
- API gateway and Node HTTP adapter;
- Admin shell and operational modules;
- categories, collections, products, variants, colors, sizes, and barcodes;
- inventory ledger, reversal, reservation, ATS, consumption, and allocation;
- sales order lifecycle, draft amendment, channels, booths, and summaries;
- POS counters, sessions, carts, barcode lookup, guided selling, checkout, and receipts;
- checkout payments, later collections, return credits, and manual refund recording;
- public Storefront catalog, guest bag, server-priced COD checkout, and Admin online-order visibility.

Not production complete:

- real login/session transport and identity provider;
- payment gateway authorization/capture/webhooks/automated refunds;
- customer accounts, CRM, loyalty, and notifications;
- courier/shipping and order tracking;
- catalog media publishing;
- exchanges, return approval/QC/restocking;
- tax, promotions, accounting, analytics, and forecasting;
- scanner/printer/cash-drawer drivers;
- deployment, observability, backup, and SLO operations.

## 11. Development Protocol for AI

Before changing code:

1. Inspect `git status`, branch, HEAD, and remote relationship.
2. Read the user's exact milestone and prohibitions.
3. Read relevant source, contracts, tests, module architecture, ADRs, and migration patterns.
4. Identify the owning bounded context and source of truth.
5. Confirm whether a migration is genuinely required.

While implementing:

1. Keep scope narrow and follow current repository patterns.
2. Preserve unrelated user changes in a dirty worktree.
3. Use strict contracts and server-derived trusted facts.
4. Add tests proportional to transaction/security/concurrency risk.
5. Update architecture/security/ADR documentation when decisions change.
6. Use `apply_patch` for manual edits.

Before handoff:

1. Inspect the final diff and changed-file scope.
2. Confirm no generated, build, secret, or local environment files are staged.
3. Confirm migration count and migration/schema impact explicitly.
4. Run required local checks and report unavailable PostgreSQL honestly.
5. Commit and push normally; do not amend or force-push unless explicitly ordered.
6. Wait for the newest branch-head CI; never report a pending or old run as green.
7. Verify local/remote SHA match, clean tree, and requested PR state.

## 12. Standard Verification

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm boundary:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:run
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm build
corepack pnpm audit --audit-level moderate
corepack pnpm verify:migration-encoding
corepack pnpm verify:prisma-cli-compat
corepack pnpm verify:generated-client-race
corepack pnpm verify:integration-package-resolution
git diff --check
```

For database changes, CI must prove:

```text
PostgreSQL healthy
migration deploy and status successful
first integration suite: all pass, zero skipped
database reset successful
all migrations reapplied
second integration suite: all pass, zero skipped
Prisma drift: No difference detected.
```

## 13. Forbidden Changes Without Explicit Scope

- weakening organization isolation, authorization, locks, idempotency, audit, or database constraints;
- trusting browser identity, permissions, prices, totals, stock, settlement, or timestamps;
- mutating posted inventory, completed sales, original receipts, payments, returns, or refunds;
- modifying historical migrations or hiding drift;
- skipping reset/reapply or integration tests to make CI pass;
- adding business rules to UI, HTTP routes, API mappers, or Prisma repositories;
- adding login, payments, hardware, analytics, deployment, or unrelated features to a focused correction;
- introducing secrets, real customer data, or payment credentials;
- force-pushing, amending, rebasing, resetting, merging, or changing PR readiness contrary to the user's Git instructions.

## 14. Reference Order

When sources appear inconsistent, use this order:

1. current user specification and explicit constraints;
2. current source code, schema, migrations, and tests;
3. current focused module architecture/security documents and accepted ADRs;
4. this AI context and the master documentation;
5. older milestone status prose, which may describe an earlier repository state.

Key entry points:

- `docs/SENVO-WEAR-MASTER-DOCUMENTATION.md`
- `docs/SENVO-WEAR-ARCHITECTURE-OVERVIEW.md`
- `docs/product-status.md`
- `docs/decisions`
- `docs/security`
- `docs/operations/database-verification.md`
- `CONTRIBUTING.md`
