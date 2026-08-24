# Operational Offline-First V1

Operational V1 reuses the existing catalog, inventory ledger, reservation,
sales, POS, payment, receipt, return, refund, media, authorization, audit, and
Storefront boundaries.

The production API process is `@senvo/api-runtime`. It composes the existing
transport-independent handlers and application services; it does not duplicate
business rules. Admin `/pos/sell` is the billing terminal. The dedicated POS
app redirects to that workspace so staff have one supported checkout flow.

The Admin dashboard is a read-only organization-scoped projection of immutable
receipt/payment/return history and current inventory ledger state. Date
boundaries use the organization's timezone. Profit and margin are intentionally
absent because the current catalog does not own a reliable cost basis.

SSLCOMMERZ remains disabled unless `SSLCOMMERZ_ENABLED=true` and complete
server-only configuration is supplied. COD and offline POS do not require its
credentials.
