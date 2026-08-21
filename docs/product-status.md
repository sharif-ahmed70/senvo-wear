# Product Status

Read this file first when continuing SENVO Wear product work.

## Completed

- Organization, branches, team, identity, credential authentication foundation, and authorization
- Catalog, attributes, and barcodes
- Inventory ledger, reservations, and allocation
- Sales order core and Admin order operations
- POS sessions, cart, and checkout
- POS payments and receipts
- Outstanding payment collection
- Returns, credits, and refunds
- Storefront Commerce MVP: public catalog, guest cart, COD checkout, inventory reservation, confirmation, and Admin online-order visibility
- Product media gallery with canonical primary, variant imagery, accessible Storefront rendering, and Admin management
- Curated per-collection Storefront product ordering
- Provider-neutral online payment attempts, verified SSLCOMMERZ IPN processing, reconciliation, and provider-refund integration

## Current

- P2.1 online-payment code complete; dedicated SSLCOMMERZ sandbox credentials and external callback verification remain an operations gate

## Next

- Advanced publishing schedules and media processing
- Production cloud object storage, image transformations, and CDN optimization
- Production login and session transport
- Courier/order tracking (online payment is implemented separately)
- CRM, customer 360, and loyalty
- Analytics and reports
- Growth, social commerce, and wholesale
- Production hardening

# Operational V1 Update (August 2026)

Operational Offline-First V1 is implemented on `feat/operational-v1` with a
deployable API runtime, production password/session transport, S3-compatible
product media, Admin POS entry, and essential operational reporting. Existing
catalog, inventory, sales, receipt, collection, return/refund, and Storefront
flows are reused.

Online payment code is parked and disabled by default pending external
SSLCOMMERZ verification. Courier, CRM, loyalty, promotions, and advanced BI
remain deferred. Profit/margin reporting requires a future governed cost basis.
