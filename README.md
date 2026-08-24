# SENVO Wear

SENVO Wear is a modular clothing ERP with operational Admin, POS, and customer Storefront applications backed by shared domain, application, API, PostgreSQL, authorization, transaction, and audit boundaries.

## Current Status

The repository includes organization/team access, catalog/media/barcodes, inventory and reservations, customers/vendors/purchases, sales orders, POS checkout/payment/receipts/returns/refunds, operational reporting, and the guest Storefront commerce vertical slice. See [docs/product-status.md](docs/product-status.md) before planning new product work.

## Architecture Summary

The repository uses a pnpm and Turborepo monorepo with three Next.js App Router applications and shared packages for UI, contracts, domain boundaries, database access, logging, storage, testing, configuration, and small generic utilities.

## Repository Structure

- `apps/storefront`: public catalog, guest bag, checkout, and order confirmation on port `3000`.
- `apps/admin`: owner/staff operational workspace on port `3001`.
- `apps/pos`: standalone showroom POS shell on port `3002`; current guided selling workflows are in `apps/admin`.
- `packages/ui`: small accessible UI primitives and design tokens.
- `packages/database`: Prisma/PostgreSQL persistence, repositories, migrations, and transaction infrastructure.
- `packages/domain`: business models, policies, repository contracts, and use cases.
- `packages/contracts`: API-facing contract boundary.
- `packages/config`: shared TypeScript, ESLint, and test configuration.
- `packages/logger`: structured logging boundary.
- `packages/storage`: provider-neutral storage boundary.
- `packages/testing`: shared Vitest helpers.
- `packages/utils`: genuinely generic utilities only.
- `docs`: architecture, ADR, security, testing, and operations documentation.

## Prerequisites

- Node.js 22 LTS is the repository runtime target. CI pins `22.23.1`; local tooling requires `>=22.13`.
- pnpm `11.9.0`.
- PostgreSQL is required for the full migration and integration verification gate. Static checks, unit tests, and application builds do not require a running database.

Enable pnpm with Corepack if needed:

```sh
corepack enable
corepack prepare pnpm@11.9.0 --activate
```

## Installation

```sh
pnpm install
```

## Environment Setup

Copy `.env.example` values into local untracked environment files as needed. Do not commit secrets.

Required foundation variables:

- `DATABASE_URL`: PostgreSQL connection string for Prisma commands that need datasource validation.
- `APP_ENV`: server-side environment label such as `development`, `staging`, or `production`.
- `NEXT_PUBLIC_APP_ENV`: non-secret application environment label.
- `STOREFRONT_ORGANIZATION_CODE`: server-only organization code used to resolve the public Storefront tenant.
- `NEXT_PUBLIC_SENVO_API_URL`: public HTTP API base URL consumed by Storefront and Admin clients.

For database verification, copy `.env.test.example` into an untracked local file or export equivalent values. Test database names must clearly include `test`; scripts refuse production-like environment labels and production/staging-looking database targets.

## Development Commands

```sh
pnpm dev
pnpm dev:storefront
pnpm dev:admin
pnpm dev:pos
```

Application ports:

- Storefront: `http://localhost:3000`
- Admin: `http://localhost:3001`
- POS: `http://localhost:3002`

## Quality Commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:run
pnpm boundary:check
pnpm build
```

## Database Commands

```sh
pnpm db:validate
pnpm db:generate
pnpm db:migrate:create
pnpm db:migrate:deploy
pnpm db:test:start
pnpm db:test:ensure
pnpm db:test:migrate
pnpm db:test:status
pnpm db:test:reset
pnpm db:test:drift
pnpm test:catalog:integration
pnpm verify:database
pnpm verify:generated-client-race
```

`db:validate` and `db:generate` may run without a real database in development and CI. Runtime database access, migration creation, migration deployment, and development-only `db push` require an explicit `DATABASE_URL`.

`db:test:start` uses the optional `compose.test.yaml` PostgreSQL service when Docker is available. Docker is not mandatory; the same commands work with an externally provided `TEST_DATABASE_URL` and `TEST_SHADOW_DATABASE_URL`.

Production migrations must use reviewed Prisma migrations, not production `db push`.

## Verification Status

- The quality gate covers package boundaries, formatting, linting, typechecking, unit tests, Prisma validation and generation, application builds, and dependency audit.
- PostgreSQL integration covers migration deploy/status, repository and transaction tests, reset/reapply, a second integration pass, and drift detection.
- CI runs on Node.js 22.23.1 with PostgreSQL 17.

## Important Limitations

- Production password/session transport exists in Operational V1; external deployment and identity-provider integration remain operations work.
- Product media upload, ordering, and Storefront publishing exist; advanced processing, schedules, and CDN delivery remain deferred.
- Storefront checkout supports guest cash-on-delivery plus provider-neutral online-payment flows; courier integration remains deferred.
- The standalone `apps/pos` shell remains a placeholder; current guided POS workflows are served through the Admin application.
- No real branding or logo system.
- No production deployment configuration.
- Customer records and operational reports exist; loyalty, customer segmentation, accounting-grade reporting, and advanced BI are not implemented.

## Next Planned Milestone

After Operational Commerce MVP acceptance, the next slices are deployment hardening, courier integration, and accounting/advanced reporting decisions.
