# SENVO Inventory — Stock Adjustment Ready

Status: frontend workflow implemented on `design/admin-ux-system`; backend draft-creation binding remains intentionally gated.

## User workflow

`Inventory → Stock Adjustment`

1. Choose correction direction:
   - `Adjustment In`
   - `Adjustment Out`
2. Choose one active stock location.
3. Add variants by barcode scan or Product → Variant selection.
4. Review current `On Hand / Reserved / Available to Sell` context.
5. Enter a required adjustment reason.
6. For `Adjustment Out`, explicitly acknowledge that the physical difference was checked.
7. Revalidate stock immediately before posting an OUT correction.
8. Create one idempotent draft movement.
9. Post that same draft through the existing `/inventory/movements` posting route.
10. Show movement number/status and links back to Inventory / Movement History.

## Inventory semantics

The frontend never writes a replacement stock number.

- `ADJUSTMENT_IN`
  - `destinationLocationId = selected location`
  - `sourceLocationId = null`
- `ADJUSTMENT_OUT`
  - `sourceLocationId = selected location`
  - `destinationLocationId = null`

This mirrors the existing domain `assertMovementShape` rules.

## Adjustment Out safety

The Admin workflow intentionally limits Adjustment Out to current **Available to Sell**, not raw On Hand.

Reason: units already reserved for active demand should not silently disappear through a correction workflow. If the physical shortage affects reserved units, the reservation/order state must be resolved explicitly first.

The UI therefore:

- shows On Hand / Reserved / Available;
- refuses to add an OUT line when unreserved availability is zero;
- caps quantity at current unreserved availability;
- re-reads source availability immediately before confirmation;
- blocks posting when availability changed beneath the requested quantity.

The backend remains authoritative and must independently validate the final movement.

## Required reason / audit context

`reason` is mandatory in the UI. Optional additional details may include:

- cycle-count reference;
- damage report;
- shrinkage note;
- internal count sheet reference.

The movement `note` stores user-facing reason/details. The request also sends a paired reference:

- `referenceType = ADMIN_STOCK_ADJUSTMENT`
- `referenceId = <adjustment UUID>`

## Missing backend binding

The Admin frontend expects:

`POST /inventory/movement-drafts`

This route does not currently exist in the Node HTTP adapter.

It must be a minimal binding to the existing domain `createInventoryMovement` capability. Do **not** create a second inventory subsystem and do **not** update balance rows directly.

Expected service-level input should be equivalent to the existing `createInventoryMovementInputSchema` with `organizationId` removed from public input and injected from the authenticated execution context.

Required permission: inventory create/update according to the final workforce permission reconciliation. Keep organization scope server-derived.

## Critical reference-pair follow-up discovered during this implementation

Domain `normalizeReferencePair` requires `referenceType` and `referenceId` to be supplied together or both omitted.

The new Stock Adjustment frontend is correct and supplies both.

Before enabling `/inventory/movement-drafts`, review the already-prepared Receive Stock and Transfer Stock payloads. Their current design-branch implementations send `referenceType` but were prepared before this domain pairing requirement was re-checked. Update them so they also supply a stable paired `referenceId` (their existing receipt/transfer UUID is the intended value) before treating those flows as production-ready.

Do not weaken the domain pair validation to accommodate the frontend.

## Idempotency

The adjustment uses:

- `idempotencyKey = admin-adjustment:<UUID>`
- movement number derived from the same UUID

If draft creation succeeds but posting fails, retry must post the already-created draft instead of creating a second adjustment.

## Required backend tests

At minimum:

1. authenticated same-org user with permission can create `ADJUSTMENT_IN` draft;
2. authenticated same-org user with permission can create `ADJUSTMENT_OUT` draft;
3. organization id is ignored/rejected from client input and comes from session context;
4. cross-org location/variant access is rejected;
5. wrong movement shape is rejected;
6. duplicate variant line is rejected;
7. empty lines are rejected;
8. idempotent same-key/same-payload returns same draft;
9. same key/different payload returns idempotency conflict;
10. posting the draft creates correct immutable ledger history;
11. posted movement cannot be edited as a balance overwrite;
12. concurrent/stale OUT attempts cannot produce invalid inventory state;
13. permission denial returns correct API failure without mutation;
14. audit record is written for final posted movement.

## Frontend verification required at merge time

Run in the real repo after Cline merges workforce auth + draft binding:

- Admin lint
- Admin typecheck
- Admin tests
- Admin production build
- API/HTTP tests for draft creation
- inventory domain/application/database tests
- PostgreSQL integration suite

Also smoke-test:

- scan barcode → Adjustment In;
- manual variant → Adjustment In;
- Adjustment Out with reserved stock;
- stale availability before final confirm;
- duplicate scan increments quantity instead of adding duplicate line;
- missing reason;
- missing acknowledgement for OUT;
- network failure after draft creation but before post;
- retry posts same draft only once.
