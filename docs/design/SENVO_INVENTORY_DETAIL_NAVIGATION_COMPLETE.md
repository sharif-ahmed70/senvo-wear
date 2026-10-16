# SENVO Inventory — Movement Detail Navigation Complete

## Scope

This handoff completes the approved Movement History → Movement Details navigation without adding any new inventory business logic.

## What changed

- The selected Movement History preview now exposes **View full movement**.
- The link routes to `/inventory/movements/[movementId]`.
- The list-row read data is carried as URL snapshot context (`occurredAt`, type, status, product, SKU, variant, source, destination, quantity).
- The snapshot is only a graceful frontend fallback while the existing domain movement-by-ID capability is not yet exposed through HTTP.
- Once `GET /inventory/movements/:movementId` is bound, the same page hydrates the authoritative `InventoryMovementContract` and the snapshot becomes secondary/fallback only.

## No duplicate backend work

Do **not** create another movement repository, ledger, movement model, or stock-calculation system.

Existing backend already owns:

- inventory movements and lines,
- draft/post semantics,
- idempotency,
- organization scoping,
- movement-by-ID domain/repository capability,
- availability/read models.

The future integration task is a thin read binding only.

## Inventory remaining-page audit

`apps/admin/app/inventory/locations/page.tsx` already exists and renders the existing Inventory workspace locations view. Therefore Stock Locations is **not** a new backend or route feature. The remaining work there is visual/UX redesign only, preserving the current real `listStockLocations()` API behavior.

## Merge-agent instruction

Preserve the approved Movement History and Movement Details frontend. Do not redesign these pages during integration. Bind the existing movement-by-ID capability to the expected GET route, run targeted tests/typecheck/build, and keep posted movement history immutable.
