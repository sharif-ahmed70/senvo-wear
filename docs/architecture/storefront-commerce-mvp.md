# Storefront Commerce MVP

## Boundary

The Storefront is a public transport client of the existing API/application boundaries. It never imports Prisma or domain repositories. `STOREFRONT_ORGANIZATION_CODE` is resolved server-side to one ACTIVE organization; public request bodies cannot choose an organization, actor, channel, status, price, total, allocation, or payment state.

## Catalog

`GET /storefront/catalog` and `GET /storefront/products/:slug` return ACTIVE products and variants only. The read model exposes names, taxonomy, variants, current selling price, and `IN_STOCK`/`OUT_OF_STOCK`. Availability is derived from posted inventory at ACTIVE sellable locations minus ACTIVE reservations. It never reveals quantities, locations, costs, or organization internals.

## Checkout

`POST /storefront/checkouts` accepts guest contact/delivery fields, bounded variant quantities, a note, COD preference, an idempotency key, and the unit price most recently reviewed from the public read model. The reviewed price is comparison data, not authority. The application reloads current variant prices and rejects a mismatch before any write. One outer Prisma transaction creates an ONLINE SalesOrder, reserves stock through the existing reservation lifecycle, creates the one-to-one commerce profile, and appends `STOREFRONT_ORDER_PLACED`.

Successful orders finish as `RESERVED`. COD is an unpaid preference; checkout creates no PaymentBatch or PaymentLine. Reservation advisory locks remain the oversell control. A failed reservation rolls back the order, commerce profile, and audit entry.

## Guest State

The persisted browser bag contains only a versioned list of variant IDs and bounded quantities. Legacy records are reduced to those selection fields when read; names, SKU, color, size, availability, and price are never trusted or written back as cart state. Cart and checkout pages hydrate selections from the current public catalog before showing totals or enabling checkout. Refresh failures and unavailable items preserve the selection for retry or editing. Checkout keys survive uncertain retries for unchanged normalized payloads and rotate when customer, cart, or reviewed-price input changes.

`NEXT_PUBLIC_SENVO_API_URL` is required for browser API requests. Local development configures it in the local environment; the runtime has no localhost fallback.

## Admin

The existing authorized sales-order workspace filters by channel and identifies ONLINE COD orders as unpaid. Existing confirm, cancel, and fulfill application actions remain authoritative.
