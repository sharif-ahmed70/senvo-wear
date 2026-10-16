# SENVO Inventory Frontend — QA Freeze

Status: **Frontend/design ready for integration pass**

Branch: `design/admin-ux-system`

This document freezes the approved Inventory frontend scope so the later Cline / Codex / Antigravity integration pass can stay narrow. Do not redesign these screens during backend integration unless a compile/runtime issue makes a small change necessary.

## Frontend routes ready

- `/inventory` — overview, availability, scan-to-find-stock, recent activity, quick actions
- `/inventory/receive` — Receive Stock workflow
- `/inventory/transfer` — Transfer Stock workflow
- `/inventory/adjustment` — Stock Adjustment In/Out workflow
- `/inventory/movements` — premium Movement History
- `/inventory/movements/[movementId]` — Movement Details
- `/inventory/locations` — premium Stock Locations

All approved pages follow the SENVO design system and avoid fake successful mutations, fake inventory valuation, fake thresholds, fake print/activity counts, or unsupported record metadata.

## QA pass completed

### Navigation

- Inventory overview links/routes to Receive, Transfer, Adjustment, Movements and Locations.
- Movement History selected record links to the full Movement Details route.
- Detail navigation carries a real list-read snapshot so the detail page is useful before the thin detail endpoint is exposed.
- Back/cancel links return to the Inventory context.
- Overview action routing is permission-hardened: the temporary routing bridge only intercepts stock mutation actions when `INVENTORY:CREATE` is present. Read-only users remain on the existing permission-gate UX.

### States

Approved routes include appropriate loading, error, empty and permission-denied states. Mutation workflows surface integration failure instead of claiming stock changed when the backend create-draft boundary is unavailable.

### Inventory truth

- On Hand / Reserved / Available to Sell remain backend-authoritative.
- Stock is never directly overwritten by these frontends.
- Transfer and Adjustment Out re-check source availability before final confirmation.
- Reserved units are protected by frontend validation and must remain authoritative in backend posting logic.
- Posted movement history is treated as immutable/read-only.

### Duplicate-information rule

One fact should have one primary place. The final Inventory pages avoid repeating the same status, location, quantity or summary in multiple decorative cards. Side panels exist only for distinct context or actions.

## Existing backend capability to reuse

Do **not** create another inventory subsystem.

Existing domain/repository capabilities already cover movement creation, movement lookup, posting, reversal/history and inventory availability. Existing Admin reads already expose availability, locations, movement history and variant availability.

The integration pass should expose the existing capabilities through thin secured boundaries only.

## Integration blockers — exact scope

### 1. Create movement draft HTTP/API binding

Frontend workflows expect:

`POST /inventory/movement-drafts`

This must call the existing domain/application movement-creation capability. Do not implement balance writes or duplicate ledger logic in the HTTP layer.

Required properties:

- authenticated workforce organization derived server-side
- organization/stock-location/variant isolation
- canonical inventory mutation permission
- idempotency preserved
- validation errors returned through existing API error format
- no direct stock-total update

After draft creation, the existing posting boundary is used to post the draft.

### 2. Movement Details thin read binding

Frontend expects:

`GET /inventory/movements/:movementId`

Return the existing `InventoryMovementContract` (or an intentionally compatible detail read contract) using the existing organization-scoped movement-by-ID capability.

Do not redesign the Movement Details page when this is added. Hydrate the current UI.

### 3. Receive + Transfer reference pair must be completed before enabling draft creation

The Inventory domain requires `referenceType` and `referenceId` as a pair.

The current Stock Adjustment frontend already sends both.

Before enabling `/inventory/movement-drafts`, update the prepared Receive and Transfer payloads so they also send a stable `referenceId`:

- Receive: use the existing per-workflow `receiptId` as `referenceId`
- Transfer: use the existing per-workflow `transferId` as `referenceId`

Do **not** weaken the domain validation to accommodate missing `referenceId`.

### 4. Inventory mutation permission semantics must be reconciled

Current frontend workflows gate creation with `INVENTORY:CREATE`; the existing movement-posting boundary has historically used inventory update authorization.

During workforce-auth integration, define one intentional rule for the complete create-draft → post operation. Do not create a state where a user may create a draft but is unexpectedly unable to complete the same approved operation.

Prefer preserving least privilege and existing role semantics rather than bypassing authorization in the UI or HTTP adapter.

### 5. Stock Location write actions are intentionally absent

The premium `/inventory/locations` screen is read-focused because the current Admin inventory surface does not expose stock-location create/update actions. Do not add dead `Add Location`, hierarchy editing or fake location balance controls.

The current read contract exposes the meaningful fields used by the page: location identity/name, branch context, type, sellable flag and status. A richer organization/location management workflow can later be integrated from the canonical organization/store-location capability rather than duplicated here.

## Merge-agent instructions

1. Start from current source + schema/contracts; do not copy stale docs over code.
2. Preserve the approved frontend composition and route names.
3. Reuse existing inventory domain/repositories.
4. Add only the missing thin bindings listed above.
5. Fix Receive/Transfer `referenceId` payloads before enabling draft creation.
6. Reconcile canonical inventory mutation permissions with workforce auth.
7. Replace preview `adminFoundationSession` composition with the real workforce principal as part of the auth integration pass, not by weakening page permission checks.
8. Run targeted inventory tests, Admin typecheck/lint/build, then responsive/browser smoke tests.
9. Do not merge/rebase the design branch blindly; the source feature branch has concurrent workforce-auth commits.

## Mandatory verification before production merge

- Receive: create draft → post → inventory availability changes once
- Transfer: source decreases, destination increases once; same-location rejected
- Adjustment In/Out: correct direction/location semantics; reason preserved
- idempotent retry does not duplicate a movement
- cross-organization movement/location/variant IDs rejected
- reserved stock cannot be silently moved/adjusted out beyond authoritative availability
- Movement History loads/filter/paginates
- Movement Details returns only the authenticated organization record
- read-only workforce users cannot perform stock mutation workflows
- desktop/tablet/mobile smoke pass
- keyboard/focus/dialog smoke pass
- `pnpm` targeted typecheck/lint/tests/build pass

## Freeze rule

Inventory frontend is now considered **design-complete**. Future work on this module should be integration, verification or a specifically approved UX change — not a broad redesign.
