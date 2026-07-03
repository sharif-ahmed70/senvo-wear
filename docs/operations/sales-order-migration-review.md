# Sales Order Migration Review

Migration: `202607030006_add_sales_order_core`

## Adds

- `SalesOrderStatus`
- `SalesOrderChannel`
- `sales_orders`
- `sales_order_lines`

## Integrity Checks

- Organization-scoped order identity and idempotency.
- Same-organization foreign keys to allocation policy, reservation, movement, and product variant.
- Restrictive deletes for business history.
- Non-negative integer money.
- Total formula checks.
- Positive quantity and line number.
- Lifecycle shape checks for reservation and movement linkage.

## Operational Notes

The migration is additive and does not alter existing tables destructively. It follows the repository convention of Prisma `@default(uuid())` in schema with application/client-generated UUIDs rather than database UUID defaults in manual SQL.
