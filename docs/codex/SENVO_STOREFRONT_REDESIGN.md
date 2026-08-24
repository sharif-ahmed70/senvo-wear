# SENVO Storefront redesign handoff

## Objective

Replace the basic presentation in `apps/storefront` with the approved premium
Senvo fashion experience while preserving the monorepo's implemented backend,
contracts, routes, media, inventory, cart, checkout, and payment behavior.

The visual reference is stored as numbered base64 parts so the complete binary
design package can travel with the repository. Reconstruct and verify it with:

```bash
bash docs/codex/unpack-design-reference.sh
```

The extracted reference is then available at:
`/tmp/senvo-storefront-design-reference/reference`

Approved live reference:
`https://senvo-fashion.hridoysakibahmed.chatgpt.site`

The archive is authoritative for source details when the live reference cannot
be opened from a Codex environment.

## Existing implementation to preserve

- `apps/storefront/app/_lib/storefront-api.ts`
  - `GET /storefront/catalog`
  - `GET /storefront/products/:slug`
  - `GET /storefront/payment-options`
  - `POST /storefront/checkouts`
  - payment status and retry routes
- `apps/storefront/app/_lib/cart.ts`
  - versioned guest selections by product variant ID
  - hydration against current catalog data
  - out-of-stock handling
  - current-price refresh
  - quantity limit of 20
- Existing catalog, product, cart, checkout, payment, success, and failure routes.
- `@senvo/contracts` request/response schemas and API failure envelope.
- Backend product media, canonical primary image, variant imagery, curated
  collection order, inventory, reservations, checkout idempotency, COD, and
  online-payment behavior.

## Product-status constraints

- Production customer login/session transport is not complete. Do not invent
  login, server wishlist, or order-history functionality.
- SSLCOMMERZ integration code exists, but credentialed sandbox verification is
  an operations gate. Preserve the existing payment boundary and never add fake
  success behavior.
- Courier tracking, loyalty, CRM, and analytics are outside this redesign.

## Required redesign coverage

1. Global header, announcement, mobile navigation, search, bag count, footer,
   newsletter, and configurable WhatsApp helper.
2. Three-slide campaign hero using the included original assets.
3. Catalog filters backed by the current API, real categories/collections,
   real media, availability, pagination/load-more behavior, and useful states.
4. Product detail with gallery, variant-aware images, colour/size selection,
   stock status, pricing, add-to-bag feedback, and accessible controls.
5. Cart with real hydrated item data, quantity editing, removal, unavailable
   item handling, retry, current price, and checkout eligibility.
6. Checkout with the current customer/address fields, COD and online-payment
   choices, backend validation, idempotency, stale-price/out-of-stock handling,
   submission states, and safe redirect behavior.
7. Payment status/retry and order confirmation styled consistently with the
   premium storefront.
8. Responsive layouts, keyboard/focus behavior, reduced motion, semantic
   headings, accessible names, loading skeletons, empty/error/retry states, and
   no horizontal overflow.

## Technical direction

- Preserve Next.js App Router and the pnpm/Turborepo architecture.
- Use real backend contracts instead of the reference demo catalog/store.
- Motion is approved for the hero and viewport animation.
- TanStack Query may replace ad-hoc fetching when done coherently, with stable
  query keys and correct mutation invalidation; do not mix two competing data
  layers without reason.
- Zustand may manage UI/guest state only if it preserves the current versioned
  cart format and hydration rules.
- React Hook Form and Zod may improve checkout/newsletter forms while retaining
  the exact backend payload, idempotency behavior, and field errors.
- Radix/shadcn-style accessible primitives are acceptable when they match the
  brand rather than replacing it with a generic component-library look.
- Do not add GSAP or Three.js for this milestone.

## Environment

Continue using the existing variables, especially:

- `NEXT_PUBLIC_SENVO_API_URL`
- `STOREFRONT_ORGANIZATION_CODE`
- existing SSLCOMMERZ server-only variables

Add `NEXT_PUBLIC_WHATSAPP_NUMBER` only for an approved public business number.
Do not rename existing variables casually or expose server-only values.

## Definition of done

- The new premium design is implemented in `apps/storefront`, not as a parallel
  demo application.
- No existing real commerce capability or route is lost.
- Demo catalog and product sprites are not production data sources.
- Real product media and variants render correctly.
- Catalog, product, cart, checkout, payment, and confirmation share one coherent
  visual system across desktop and mobile.
- Backend remains authoritative for availability, price, total, order, and
  payment state.
- Targeted Storefront lint, typecheck, tests, and build pass.
- Formatting and boundary checks pass.
- Remaining operations gates are reported accurately and not simulated.
