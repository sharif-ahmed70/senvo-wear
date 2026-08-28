# SENVO Sales Orders — Main List Frontend Handoff

## Status

Frontend design implementation ready on `design/admin-ux-system`.

## Reuse, do not duplicate

The repository already has a real Sales Orders system. The approved list page continues to use `AdminApiClient.listSalesOrders()` and the existing `/sales/orders/:id` details route.

Existing order-details functionality must be preserved:

- get order details
- reserve order
- confirm order
- fulfill order
- cancel order
- online-payment read
- provider reconciliation
- provider refund flow

Do not rebuild any of those capabilities while merging this list redesign.

## Main list behavior

The premium list workspace provides:

- exact backend status tabs: All, Draft, Reserved, Confirmed, Fulfilled, Cancelled
- order-number search through the existing list API
- existing sales-source filter: Online, Store, Event booth, POS, Manual
- newest-first order
- cursor pagination
- Customer, Source, Payment preference, Status, Total, Created and Delivery Area columns
- direct order-detail navigation
- refresh, loading, empty, error and permission states
- New Sale (POS) shortcut only when the current permission set satisfies the existing POS navigation requirements
- responsive horizontal table behavior on narrow screens

## Information architecture rule

No global KPI cards were added. The current list API does not provide authoritative organization-wide aggregate counts, so page-level count cards would either repeat table state or imply unsupported totals.

One fact has one primary location. Order number, customer, status, source, payment preference and total remain in the operational row; the full record is opened only when deeper context/action is needed.

## Payment wording

The list intentionally describes the payment *preference* available in the list contract. It does not invent provider success/failure state.

- `CASH_ON_DELIVERY` → Cash on delivery / collection pending
- `ONLINE_PAYMENT` → Online payment / open full order for provider status
- absent commerce data → Not available

Authoritative provider status remains on the existing order-detail payment panel.

## Files

- `apps/admin/app/sales/orders/_components/sales-orders-list-workspace.tsx`
- `apps/admin/app/sales/orders/_components/sales-orders-list-workspace.module.css`
- `apps/admin/app/sales/orders/page.tsx`
- `apps/admin/app/sales/orders/loading.tsx`
- `apps/admin/app/sales/orders/error.tsx`

The existing `sales-orders-workspace.tsx` remains the source for the already-implemented order detail/action/payment flows.

## Merge-agent instructions

1. Preserve the approved list UI and route behavior.
2. Reuse existing Sales Order API/domain/application code.
3. Do not replace the order detail workflow with a second implementation.
4. Bind the design branch to the latest workforce-auth server session during integration; remove preview-session composition at that stage.
5. Run Admin lint/typecheck/build and targeted sales tests after integration.
6. Do not add fake dashboard totals to match mockups.
