# SENVO Inventory Movement Details — Approved Frontend Handoff

Status: frontend-ready on `design/admin-ux-system`; backend detail binding intentionally not duplicated.

## UX rule locked in

SENVO detail/overview screens must not repeat the same business fact across multiple cards just to fill space.

- one fact has one primary home;
- secondary surfaces may reference it only when needed for an action or decision;
- empty cards are removed instead of padded with fake data;
- unsupported totals, cost/value, actor names, attachments and audit entries are never fabricated.

## Route

`/inventory/movements/[movementId]`

## Frontend behavior

The page is already designed and coded for:

- movement identity, type, status and occurred time;
- source → destination route;
- movement lines and total units;
- product/variant/SKU hydration through the existing variant-availability API;
- stock-location name hydration through the existing location API;
- reference/idempotency/reversal metadata when actually exposed;
- movement note only when present;
- lifecycle entries derived only from real `createdAt` / `postedAt` timestamps;
- CSV export of actual movement lines;
- posted-history immutable notice;
- loading, error, permission and backend-integration states;
- responsive desktop/tablet/mobile layout.

No inventory mutation is performed by this screen.

## Existing backend capability to reuse

Do **not** create another inventory movement model/repository/service.

The domain/repository already supports organization-scoped movement lookup by ID and returns an existing `InventoryMovementContract` shape through the established application/domain contracts.

The only missing frontend dependency is a thin read binding:

`GET /inventory/movements/:movementId`

Expected response: existing `InventoryMovementContract`.

The route must derive organization scope from the authenticated workforce context. The browser must never supply organization authority.

## Integration sequence for Cline / Codex

1. Reuse the existing movement-by-ID domain/repository capability.
2. Add the smallest Application + API handler + HTTP route required to expose it.
3. Require inventory READ permission.
4. Preserve organization isolation and return not-found for cross-org IDs.
5. Do not add a second movement repository or stock calculation path.
6. Do not redesign the approved page.
7. Point Movement History's selected-row/full-detail action to `/inventory/movements/<movementId>`.
8. Optional history snapshot query parameters may be passed for graceful pre-binding context, but the server detail record remains authoritative.
9. Run targeted tests, Admin typecheck/lint/build, then merge.

## Intentionally omitted from UI until supported by real data

- unit cost / inventory value;
- creator/poster names;
- attachments/documents;
- arbitrary global movement totals;
- invented reference values;
- invented activity events.

## Non-repetition examples

- status appears with movement identity; it is not repeated in a separate summary card;
- total quantity appears with Movement Lines; it is not repeated in a second sidebar summary;
- route appears once as From → To; location cards are not duplicated elsewhere;
- notes render only as a Note section when a real note exists;
- lifecycle contains timestamps only, not duplicate metadata rows.
