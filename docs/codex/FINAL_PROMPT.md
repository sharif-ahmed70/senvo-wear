# Final prompt for Codex

Work in my connected private repository `sharif-ahmed70/senvo-wear` and complete
the premium SENVO Storefront redesign using the backend and commerce flows that
already exist in this monorepo.

First, read these files completely before editing:

1. `AGENTS.md`
2. `README.md`
3. `docs/product-status.md`
4. `docs/codex/SENVO_STOREFRONT_REDESIGN.md`
5. Run `bash docs/codex/unpack-design-reference.sh`, then read
   `/tmp/senvo-storefront-design-reference/reference/README.md` and inspect its
   complete source and asset package.

Then inspect all current routes and implementation under `apps/storefront`,
especially its API client, cart hydration, product detail, checkout,
idempotency, payment status/retry, order confirmation, tests, and the contracts
it consumes from `@senvo/contracts`. Before editing, give me a concise plan and
identify the exact existing behavior that must be preserved. Then continue
through implementation without waiting for routine approval.

Primary goal:

Transform the current basic Storefront presentation into the premium animated
Senvo fashion experience in the reference archive. Implement the redesign
inside the existing `apps/storefront`; do not deploy or maintain a second demo
frontend.

Non-negotiable requirements:

- Preserve the real catalog, category/collection filters, search, pagination,
  product details, backend media, variant-aware gallery, stock availability,
  guest cart, cart rehydration, current-price checks, unavailable-item handling,
  checkout, idempotency, cash-on-delivery, online-payment, payment status/retry,
  safe redirects, and order-confirmation behavior.
- Preserve all existing routes and API endpoint contracts. Reuse
  `apps/storefront/app/_lib/storefront-api.ts`,
  `apps/storefront/app/_lib/cart.ts`, and `@senvo/contracts`, refactoring them
  only when the new architecture clearly improves correctness.
- Use the reference for its burgundy/ivory/black/lime brand system, editorial
  typography, three-slide hero, campaign imagery, scroll motion, category rail,
  search, product cards, quick-view, cart treatment, newsletter, footer, mobile
  navigation, and WhatsApp helper.
- Do not copy the reference demo product records, mock API, or prototype cart as
  production logic. Render real backend products, media, prices, variants, and
  availability. The product sprite is fallback/demo artwork only.
- Apply the visual system consistently to every current Storefront surface,
  including catalog, product detail, cart, checkout, payment status/retry, order
  confirmation, loading, empty, unavailable, stale-price, error, retry, and
  success states.
- Keep the experience responsive, touch-friendly, keyboard accessible, focus
  safe, semantic, and compatible with `prefers-reduced-motion`.
- Motion is approved. Add TanStack Query, Zustand, React Hook Form, Zod, and
  Radix/shadcn-style primitives only where they improve the real implementation
  coherently. Scope dependencies to `@senvo/storefront` and update the pnpm
  lockfile. Do not add GSAP or Three.js in this milestone.
- Production customer authentication/session transport is not complete. Do not
  invent login, server wishlist, or order-history APIs. A purely local wishlist
  may remain clearly non-account-based if it does not block the core flow.
- Preserve the existing SSLCOMMERZ boundary. Never insert credentials, fake a
  payment result, bypass verification, or change provider webhook logic.
- Keep the backend authoritative for inventory, prices, totals, order state,
  and payment state. Never trust client-calculated totals for final checkout.
- Never commit secrets, overwrite real environment files, make destructive
  database changes, modify production data, or rewrite Admin/POS/domain/database
  code for this visual Storefront task.

Validation:

Run and pass at least:

```bash
pnpm --filter @senvo/storefront lint
pnpm --filter @senvo/storefront typecheck
pnpm --filter @senvo/storefront test:run
pnpm --filter @senvo/storefront build
pnpm format:check
pnpm boundary:check
```

Run any additional affected tests needed by the actual diff. Review the final
diff for commerce regressions, accessibility, mobile overflow, reduced motion,
API contract correctness, security, payment safety, and accidental changes
outside the Storefront scope.

At completion, report:

- routes and components redesigned;
- commerce behavior preserved;
- dependencies added and why;
- environment variables added or changed, without secret values;
- exact validation commands and results;
- any pre-existing failure or remaining operations gate;
- any one-time manual action I still need to perform.

Pause only if repository files referenced above are unavailable, a missing
backend contract would force guessing, a destructive action is required, or a
credential/payment/security decision needs my authorization. Otherwise make
the reversible code changes, validate them, and finish the task.
