# SENVO Inventory — Stock Locations Approved Frontend

Status: APPROVED / FRONTEND READY

## Purpose

Premium operational view of inventory stock locations. This redesign replaces the older generic `InventoryWorkspace` locations view while preserving the existing inventory read API and organization-scoped behavior.

## Real data used

`StockLocationReadContract` currently exposes:

- `id`
- `name`
- `type`
- `status`
- `isSellable`
- branch `id`, `name`, `status`

The page calls only the existing `AdminApiClient.listStockLocations()` read method.

## UX rules applied

- Do not repeat the same location information in decorative cards and the table.
- Summary cards are useful aggregates for the currently loaded API page only.
- Type mix is explicitly current-page context, not a global organization total.
- Search/type/status/branch filters operate on the currently loaded cursor page because the existing read input does not expose those filters.
- Cursor pagination remains authoritative.
- CSV export exports only currently visible/loaded rows.
- Loading, error, empty and permission-denied states are included.
- Mobile/tablet layouts are included.

## Intentionally not invented

The approved visual mockup contained fields/actions not exposed by the current Inventory location read contract. They are intentionally absent from runtime UI:

- stock location `code`
- parent/child stock-location hierarchy
- per-location `On Hand`, `Reserved`, `Available to Sell` totals in this directory response
- global location totals across all cursor pages
- Add Location / Rename / Archive actions

The domain model contains a stock-location `code`, but the current Admin Inventory read contract does not expose it. Do not show a generated/fake code.

## Integration guidance for Cline / Codex

Do not redesign this page and do not build a second stock-location system.

If product requirements later require write management or richer directory data:

1. audit Organization/StockLocation domain and repository capabilities first;
2. expose the smallest existing capability through Application/API/HTTP;
3. extend `StockLocationReadContract` only for fields that are truly needed;
4. bind this existing frontend without changing its information hierarchy unless necessary.

Do not calculate authoritative inventory balances from arbitrary client-side pages. Inventory availability remains owned by the existing inventory read model.

## Files

- `apps/admin/app/inventory/locations/page.tsx`
- `apps/admin/app/inventory/locations/loading.tsx`
- `apps/admin/app/inventory/locations/error.tsx`
- `apps/admin/app/inventory/locations/_components/stock-locations-workspace.tsx`
- `apps/admin/app/inventory/locations/_components/stock-locations-workspace.module.css`
