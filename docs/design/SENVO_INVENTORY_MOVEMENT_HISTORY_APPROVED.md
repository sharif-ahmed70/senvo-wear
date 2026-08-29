# SENVO Inventory Movement History — Approved Frontend Handoff

## Status

Approved premium Movement History visual direction is implemented on `design/admin-ux-system`.

Primary route:

- `apps/admin/app/inventory/movements/page.tsx`

Primary component:

- `apps/admin/app/inventory/movements/_components/movement-history-workspace.tsx`
- `apps/admin/app/inventory/movements/_components/movement-history-workspace.module.css`

## Critical integration rule

Do **not** build a second inventory movement/history backend.

This frontend reuses the existing inventory read model and `AdminApiClient.listInventoryMovements()` contract. The existing backend already provides cursor-paginated movement lines with:

- movement id
- occurred at
- movement type
- status
- variant identity
- product name
- SKU
- color / size
- source location
- destination location
- quantity

Existing filters preserved:

- location
- movement type
- status
- cursor pagination

The page-level product/SKU/location search is intentionally a client-side search over the currently loaded API page because the current movement-read HTTP contract does not expose a search query.

## Honest-data rules

The approved mockup contained aggregate KPI values and richer movement-detail fields that are not currently exposed by the read contract.

Production frontend therefore does **not** invent them.

Summary cards are explicitly labelled as current/loaded-page metrics:

- Loaded movements
- Receipts on page
- Transfers on page
- Adjustments on page

Do not rename these to global totals unless an authoritative aggregate endpoint is added.

The side detail panel only renders fields already present in `InventoryMovementHistoryContract`.

It intentionally does not fabricate:

- reference number
- notes
- actor/user
- reversal metadata
- complete multi-line movement record
- inventory value
- global movement totals

A future movement-detail endpoint can hydrate the same side panel without redesigning the page.

## Existing backend capabilities to reuse later

The inventory domain/repository already has movement-level capabilities including draft creation, movement lookup, posting, listing, draft line replacement and reversal. Do not duplicate these systems.

The current public Admin read API already supports movement history.

If full Movement Details is implemented next, prefer a thin Application/API/HTTP binding around the existing movement-by-id domain/repository capability rather than a new read system.

## UX behavior implemented

- premium SENVO Movement History layout
- current-page summary cards
- location/type/status server filters
- current-page product/SKU/location search
- cursor pagination
- real movement type/status badges
- source/destination route display
- quantity direction semantics
- selected-row detail preview
- current-page CSV export
- Receive Stock shortcut
- Transfer Stock shortcut
- Stock Adjustment shortcut
- View Inventory shortcut
- loading/error/empty/permission states
- responsive desktop/tablet/mobile layout

## Merge-agent instruction

When integrating this branch:

1. Preserve the approved frontend design unless a technical fix is required.
2. Reuse the existing inventory read API/domain/database implementation.
3. Do not replace real API data with fixture data.
4. Do not add fake aggregate metrics.
5. Keep cursor pagination authoritative.
6. If adding full movement details, expose existing backend capability through the smallest safe contract/binding.
7. Run targeted lint/typecheck/tests/build before merging.

## Verification still required in local development

The GitHub connector environment cannot execute the user's local pnpm workspace. Before production merge run the relevant Admin lint/typecheck/test/build gates in the real workspace.
