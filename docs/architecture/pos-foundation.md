# Offline Sales POS Foundation

## Purpose

The offline sales foundation prepares SENVO Wear for assisted sales at permanent stores and temporary event booths. It defines the operational counter, staff session, barcode sale lookup, and server-priced cart boundaries without implementing payment, inventory deduction, receipt printing, or order completion.

## Boundary

The POS flow follows the existing layers:

`HTTP adapter -> protected API handler -> POS application service -> domain use case -> repository`

The browser supplies only business input such as a counter source, scanned barcode, variant, and quantity. Organization, user, role, and permissions come from the trusted request context. Backend authorization uses `POS.READ`, `POS.CREATE`, and `POS.UPDATE`.

## Counter Ownership

`SalesCounter` belongs to one organization and exactly one active operational source:

- `STORE` points to an organization branch.
- `EVENT_BOOTH` points to an organization sales booth.

The existing organization `PosCounter` model remains branch configuration metadata. It is not changed or reused because offline selling sessions and carts belong to the POS bounded context. This preserves the existing organization API while making sales-counter lifecycle explicit.

## Session and Cart Lifecycle

Only an active user with an active organization membership can open a session. The counter must be active, and the database permits only one `OPEN` session per counter. Opening a session and creating its single cart happen in one database transaction. Closed sessions and their carts remain immutable history; counters and sessions use restrictive foreign keys instead of cascading deletion.

Cart lines store quantity, server-selected unit price, and server-calculated subtotal. The server reads `ProductVariant.sellingPriceMinor`; browser-submitted prices or subtotals are not accepted. This additive price field defaults to zero for existing variants and can later be managed through a dedicated pricing workflow.

## Barcode and Availability

Sale lookup is organization scoped and accepts only an active barcode attached to an active variant. It returns product, SKU, color, size, selling price, and aggregate sellable availability. A missing, inactive, cross-organization, or unavailable item is rejected before it reaches the cart.

## Deferred Extensions

- A keyboard-wedge or camera scanner can call the sale lookup route without changing domain logic.
- Product barcode lookup remains owned by catalog and is consumed through its repository contract.
- Thermal label and receipt printers should be introduced as replaceable output adapters after order and payment boundaries exist.
- Cart conversion to a sales order, stock consumption, payment, discounting, tax, and returns are deliberately deferred.
