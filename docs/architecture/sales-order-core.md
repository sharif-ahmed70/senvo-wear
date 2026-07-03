# Sales Order Core

Sales orders are organization-scoped commercial records that capture the intent to sell product variants. This foundation stores identity, lifecycle status, monetary snapshots, catalog snapshots, and inventory linkage. It does not include payment processing, delivery integration, customer accounts, invoicing, promotions, refunds, returns, POS sale completion, authentication, HTTP endpoints, or UI.

## Model

`SalesOrder` owns an ordered set of immutable `SalesOrderLine` records. Lines snapshot product name, SKU, color, and size at creation so historical order rendering does not depend on live catalog display fields.

Orders use integer minor-unit money. For BDT, `10000` means Tk 100.00. The server recomputes line totals, subtotal, and total from caller-supplied unit price snapshots, quantities, order discount, and delivery amount.

## Lifecycle

Allowed statuses are `DRAFT`, `RESERVED`, `CONFIRMED`, `CANCELLED`, and `FULFILLED`.

`DRAFT` has no inventory reservation. `RESERVED` links an active reservation. `CONFIRMED` keeps the reservation active for fulfillment. `CANCELLED` is terminal and releases an active reservation when present. `FULFILLED` is terminal and links the posted inventory issue movement that consumed the reservation.

## Integrity

Order number and idempotency key are unique per organization. Reservation and fulfillment movement linkages are unique per organization. Same-organization composite foreign keys connect allocation policy, inventory reservation, fulfillment movement, sales order lines, and product variants.
