# SENVO Inventory — Receive Stock Ready-Made Frontend

Status: frontend workflow implemented on `design/admin-ux-system`.

## User workflow

`Inventory → Receive Stock → Location → Items → Review → Confirm → Success`

The screen supports:

- active stock-location selection,
- keyboard-style barcode scanners through the existing barcode lookup API,
- manual Product → Variant selection,
- multiple receipt lines,
- duplicate scans incrementing the existing receipt line instead of creating duplicates,
- quantity editing/removal,
- optional receiving note,
- final review before ledger posting,
- permission-restricted states,
- loading/error/empty states,
- partial-command safety: if a draft was created and posting fails, the same draft is retried instead of creating duplicate stock,
- success navigation to Inventory and Movement History.

## Inventory truth preserved

The UI never writes an editable `stock = X` balance.

A receipt must become an append-only inventory movement:

- `type = RECEIPT`
- `sourceLocationId = null`
- `destinationLocationId = selected location`
- positive variant quantities
- idempotency key generated once per receiving attempt
- unique movement number generated once per receiving attempt

Only POSTING the movement is allowed to affect stock. A draft must not alter on-hand quantity.

## Existing backend capability confirmed

The domain already exposes `createInventoryMovement(...)` with:

- idempotency conflict handling,
- draft creation,
- movement-number validation,
- location semantics,
- variant lines,
- receipt/transfer/adjustment movement types.

The current application/API/HTTP path already exposes posting of an existing draft through the current `POST /inventory/movements` command with `{ movementId }`.

## Missing HTTP binding

The ready-made frontend intentionally calls:

`POST /inventory/movement-drafts`

with organization-free service input:

```ts
{
  destinationLocationId: string;
  idempotencyKey: string;
  lines: Array<{
    productVariantId: string;
    quantity: number;
  }>;
  movementNumber: string;
  note?: string | null;
  occurredAt: string;
  referenceType: "ADMIN_RECEIPT";
  sourceLocationId: null;
  type: "RECEIPT";
}
```

The server must derive `organizationId` from the authenticated workforce request context. The browser must never send or choose an organization ID for this command.

### Cline integration requirement

Add the smallest architecture-consistent binding:

1. service schema = existing `createInventoryMovementInputSchema` with `organizationId` omitted;
2. Inventory application method calls domain `createInventoryMovement(...)` inside the existing inventory transaction/repository boundary;
3. require real workforce `INVENTORY:CREATE` authorization;
4. derive organization from the validated execution context;
5. HTTP `POST /inventory/movement-drafts` returns the created DRAFT movement with status `201`;
6. keep current posting command authoritative for DRAFT → POSTED;
7. do not create any direct balance-update API;
8. do not weaken organization/repository constraints.

No new database migration should be required for this binding because inventory movements/drafts already exist in the domain/database model.

## Required verification

Before calling Receive Stock production-ready, verify:

- create draft requires authenticated workforce session;
- `INVENTORY:CREATE` required for create;
- posting remains separately authorized;
- organization is server-derived;
- same idempotency key + same payload returns the same draft;
- same idempotency key + different payload conflicts;
- draft creation does not change on-hand;
- first post changes on-hand exactly once;
- repeated post does not double-receive;
- invalid/cross-org variant and location references are rejected by the authoritative repository/domain path;
- barcode scan resolves the canonical variant ID;
- browser retry after create-success/post-failure posts the existing draft;
- Admin lint/typecheck/build and targeted inventory API/application/database tests pass.

## Follow-on Inventory tasks

After this binding is green:

1. Transfer Stock — `TRANSFER`, source + destination required.
2. Stock Adjustment — `ADJUSTMENT_IN` / `ADJUSTMENT_OUT`, explicit reason required.
3. Movement Details — immutable posted movement timeline/details and safe reversal entry point where supported.
