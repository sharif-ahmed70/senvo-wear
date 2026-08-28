# SENVO Sales Counters — Approved Frontend Handoff

## Status

Approved and implemented on `design/admin-ux-system`.

## Authoritative route

`apps/admin/app/pos/counters/page.tsx` → `SalesCountersWorkspace`.

The former combined `apps/admin/app/pos/_components/pos-management-workspace.tsx` has been retired after Checkout History, Sales Sessions, and Sales Counters moved to dedicated workspaces.

## Backend/API truth used

- `listSalesCounters()`
- `listCurrentSalesSessions()` for real open-session context only
- `listStores()` for active Store choices during counter creation
- `listSalesBooths()` for active Event Booth choices during counter creation
- `createSalesCounter()`
- `updateSalesCounterStatus()` with `expectedVersion`

Permissions:

- `POS:READ` — view counters
- `POS:CREATE` — create counter
- `POS:UPDATE` — activate/deactivate

Counter contract truth:

- name
- code
- type: `STORE | EVENT_BOOTH`
- status: `ACTIVE | INACTIVE`
- branch/booth association IDs
- created/updated timestamps exist in the contract but are not required in the primary operational table
- version for concurrency-safe status changes

## Frontend behavior

- local search by counter name/code
- local status filter
- local type filter
- derived Total / Active / In Use / Inactive summary
- current `In Use` state comes only from real current sales sessions
- CSV export uses the currently loaded/filtered real counter data
- Create Counter: name, code, Store/Event Booth type, active source selection
- activate/deactivate confirmation
- loading, empty, permission, error and responsive states

## Explicit non-features

Do not infer or implement these from the approved mockup without a separate backend capability audit:

- blocked counter state
- device/terminal health or IP
- cashier assignment
- opening/closing cash
- payment-method configuration
- sales/order/revenue metrics
- last transaction
- arbitrary counter details drawer
- edit-counter fields beyond the existing status update contract
- fake session metadata such as opener name when it is not in the session contract

## Integration note

Frontend remains backend-authoritative. Existing HTTP/application/domain behavior must be reused; do not create another POS counter/session system to satisfy the design.
