# Repository Structure

- `apps/storefront`: public catalog, guest cart, cash-on-delivery checkout, and order confirmation.
- `apps/admin`: owner and staff operations for catalog, inventory, sales orders, organization, and guided POS workflows.
- `apps/pos`: standalone online-first showroom POS shell; the current operational POS workspace is in `apps/admin`.
- `packages/ui`: shared accessible primitives and design tokens.
- `packages/domain`: domain model and policy boundary.
- `packages/contracts`: request/response and DTO boundary.
- `packages/application`: application services and transaction-aware orchestration.
- `packages/api`: transport-independent request handling and error mapping.
- `packages/http`: Node HTTP routing and trusted request-context adapter.
- `packages/database`: Prisma/PostgreSQL repositories, transactions, migrations, and integration tests.
- `packages/config`: shared tooling configuration.
- `packages/logger`: structured logging boundary.
- `packages/storage`: provider-neutral object storage contract; no production provider is connected yet.
- `packages/testing`: shared test helpers.
- `packages/utils`: generic utilities only.
- `docs`: architecture, decisions, security, testing, and operations records.
