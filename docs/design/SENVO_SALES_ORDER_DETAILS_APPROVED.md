# SENVO Sales Order Details — Approved Frontend Handoff

## Scope

Approved premium frontend for `apps/admin/app/sales/orders/[id]`.

The route now uses `SalesOrderDetailWorkspace` and preserves the existing Sales Orders backend/API contracts.

## Real data used

- `AdminApiClient.getSalesOrder(orderId)`
- sales order number, channel, status and version
- customer name / phone / email when supplied
- delivery address / district / city / postal code
- line snapshots: product, color, size, SKU, quantity, unit price, line total
- subtotal / discount / delivery / total
- inventory reservation status and stock location
- fulfillment status and posted movement number
- created / reserved / confirmed / fulfilled / cancelled timestamps
- commerce payment preference

## Real mutations preserved

Existing APIs only:

- Draft → Reserve
- Reserved → Confirm
- Confirmed → Fulfill
- Draft/Reserved → Cancel
- online payment provider reconciliation
- provider refund with idempotency key

All order-state mutations keep `expectedVersion` concurrency protection.

Cancellation has an explicit frontend confirmation before the real mutation.

## Payment behavior

For `ONLINE_PAYMENT` and users with `PAYMENT:READ`, the page reuses:

- `getOnlinePayment`
- `reconcileOnlinePayment`
- `createProviderRefund`

Provider refunds remain permission-gated by `PAYMENT:APPROVE` and use a stable idempotency key for retry safety.

For Cash on Delivery, the UI reports only the payment preference. It does not invent a paid amount, cashier, paid timestamp or receipt status.

## Intentionally omitted from the approved visual mockup

Do not re-add these unless an authoritative contract exists:

- fake product photography
- fake customer profile links
- fake sales-source detail links
- Edit Order action
- Add Note action
- invented notes/internal comments
- invented paid-by user
- invented payment timestamps/reference for COD
- fake due/paid totals
- arbitrary "More Actions"

Browser `window.print()` is used for the Print Order action; it does not imply a persisted print/download event.

## Non-repetition rule

Primary information is shown once:

- order status: header
- customer/source/payment/delivery context: context strip
- money totals: order-items section
- inventory state: inventory/fulfillment card
- lifecycle events: timeline

Do not add dashboard-style cards that repeat the same values.

## Merge-agent instructions

1. Preserve the approved list + detail visual structure.
2. Reuse existing Sales Order and payment application/domain behavior.
3. Do not recreate order/payment/inventory business logic in the frontend.
4. Replace `adminFoundationSession` composition with the real workforce principal when the auth branch is integrated.
5. Run Admin typecheck/lint/build and targeted Sales Orders tests before merge.
6. If a contract changes upstream, adapt this frontend to the authoritative contract rather than weakening backend validation.

## Files

- `apps/admin/app/sales/orders/[id]/_components/sales-order-detail-workspace.tsx`
- `apps/admin/app/sales/orders/[id]/_components/sales-order-detail-workspace.module.css`
- `apps/admin/app/sales/orders/[id]/page.tsx`
- `apps/admin/app/sales/orders/[id]/loading.tsx`
- `apps/admin/app/sales/orders/[id]/error.tsx`
