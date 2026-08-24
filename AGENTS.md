# SENVO Wear repository guidance

## Product and architecture

SENVO Wear is a pnpm/Turborepo monorepo. Read `README.md` and
`docs/product-status.md` before planning product work.

- `apps/storefront`: public Next.js storefront.
- `apps/admin`: owner and staff operations.
- `apps/pos`: standalone POS shell.
- `packages/contracts`: Zod-backed API contracts.
- `packages/domain`: business rules and use cases.
- `packages/database`: Prisma/PostgreSQL repositories and migrations.

For the premium storefront redesign task, also read:

- `docs/codex/SENVO_STOREFRONT_REDESIGN.md`
- `docs/codex/FINAL_PROMPT.md`
- `docs/codex/unpack-design-reference.sh` and the verified design package it
  reconstructs from the numbered repository parts

## Storefront redesign boundary

The current storefront commerce flow already works. Redesign the presentation
without replacing its production behavior.

Preserve and reuse:

- `apps/storefront/app/_lib/storefront-api.ts` and the existing API envelope;
- `apps/storefront/app/_lib/cart.ts`, variant IDs, cart hydration, current-price
  checks, availability checks, and quantity limits;
- catalog, product media, product detail, guest cart, checkout, idempotency,
  cash-on-delivery, online payment, payment status/retry, and order-confirmation
  behavior;
- types and schemas from `@senvo/contracts`;
- all existing route URLs and backend endpoints.

Do not copy the reference app wholesale. It contains demo data and a mock API.
Use it for visual direction, campaign assets, interaction patterns, and motion,
then adapt those pieces to the real SENVO storefront contracts.

## Backend facts that must shape the work

- Catalog, inventory, reservations, media, curated collection ordering, guest
  checkout, COD, and online-payment code are implemented.
- SSLCOMMERZ sandbox credentials and external callback verification remain an
  operations gate; do not invent credentials or bypass verification.
- Production customer login/session transport is not complete. Do not invent
  account, server wishlist, or order-history APIs during this redesign.
- Product media and variant availability from the backend are authoritative.
- Backend checkout validation is authoritative for price, stock, totals,
  payment state, and order state.

## Implementation rules

1. Inspect the existing Storefront routes, components, tests, API client, and
   contracts before editing.
2. Preserve the premium visual language from the reference: burgundy, warm
   ivory, near-black, lime accent, editorial serif typography, large campaign
   imagery, restrained motion, compact uppercase utility text, and generous
   whitespace.
3. Preserve accessibility, reduced-motion support, keyboard use, touch use,
   loading, empty, error, retry, unavailable, stale-price, and payment states.
4. Keep real backend images as the primary product media. The reference product
   sprite is a fallback/demo asset, not production catalog data.
5. Use Motion for hero and viewport animation. Add GSAP or Three.js only for a
   separately approved feature with real 3D assets and a measured reason.
6. New dependencies must be scoped to `@senvo/storefront`, added with pnpm, and
   justified by actual usage. Preserve the monorepo and lockfile.
7. Never expose secrets through `NEXT_PUBLIC_*`, source files, browser logs, or
   committed configuration. Never overwrite local environment files.
8. Do not make destructive migrations, modify production data, rotate secrets,
   or change provider webhook logic.
9. Do not rewrite Admin, POS, database, domain, or API behavior for a visual
   storefront task.

## Validation

Run targeted Storefront checks during implementation and the repository gates
before completion:

```bash
pnpm --filter @senvo/storefront lint
pnpm --filter @senvo/storefront typecheck
pnpm --filter @senvo/storefront test:run
pnpm --filter @senvo/storefront build
pnpm format:check
pnpm boundary:check
```

Run broader checks when the changed dependency surface requires them. Do not
claim a check passed unless it ran successfully.

## Code review rules

### Commerce regression

- Flag any change that bypasses variant availability, price refresh,
  idempotency, payment preference, payment status/retry, or checkout validation.

### Design regression

- Flag missing mobile navigation, broken keyboard focus, inaccessible dialogs,
  motion without reduced-motion handling, layout overflow, or inconsistent
  styling across catalog, product, cart, checkout, payment, and confirmation.

### Scope and security

- Flag guessed APIs, hard-coded secrets, browser-exposed privileged values,
  destructive migrations, unrelated Admin/POS rewrites, or replacement of
  backend-authoritative state with client-only calculations.
