# Storefront Commerce MVP

## Boundary

The Storefront is a public transport client of the existing API/application boundaries. It never imports Prisma or domain repositories. `STOREFRONT_ORGANIZATION_CODE` is resolved server-side to one ACTIVE organization; public request bodies cannot choose an organization, actor, channel, status, price, total, allocation, or payment state.

## Catalog

`GET /storefront/catalog` and `GET /storefront/products/:slug` return ACTIVE products and variants only. The read model exposes names, taxonomy, variants, current selling price, and `IN_STOCK`/`OUT_OF_STOCK`. Availability is derived from posted inventory at ACTIVE sellable locations minus ACTIVE reservations. It never reveals quantities, locations, costs, or organization internals.

## Checkout

`POST /storefront/checkouts` accepts guest contact/delivery fields, bounded variant quantities, a note, COD preference, and an idempotency key. The application reloads current variant prices and an ACTIVE allocation policy. One outer Prisma transaction creates an ONLINE SalesOrder, reserves stock through the existing reservation lifecycle, creates the one-to-one commerce profile, and appends `STOREFRONT_ORDER_PLACED`.

Successful orders finish as `RESERVED`. COD is an unpaid preference; checkout creates no PaymentBatch or PaymentLine. Reservation advisory locks remain the oversell control. A failed reservation rolls back the order, commerce profile, and audit entry.

## Guest State

The browser bag contains non-sensitive variant selection snapshots and bounded quantities. It hydrates against the public catalog to refresh price/product facts and remove inactive or unavailable variants. Browser totals are previews only. Checkout keys survive uncertain retries for unchanged payloads and rotate when customer/cart input changes.

## Admin

The existing authorized sales-order workspace filters by channel and identifies ONLINE COD orders as unpaid. Existing confirm, cancel, and fulfill application actions remain authoritative.
