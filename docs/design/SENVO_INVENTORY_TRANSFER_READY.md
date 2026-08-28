# SENVO Inventory — Transfer Stock Ready

Status: frontend workflow implemented on `design/admin-ux-system`.

## User flow

`Inventory → Transfer Stock → Route → Items → Review → Confirm → Complete`

### 1. Route

- Select an active source stock location.
- Select a different active destination stock location.
- The UI never allows source and destination to be the same.
- If the source is changed after items were selected, transfer lines are cleared because their availability belongs to the previous source.

### 2. Items

Users can resolve a variant by:

- scanning/entering an active barcode, or
- Product → Variant selection.

Before a line is added, the frontend reads source-location inventory availability and resolves the exact variant.

Each line displays:

- product / color / size / SKU,
- on hand,
- reserved,
- available to sell,
- requested transfer quantity.

Transfer quantity is capped at `availableToSell`, not raw `onHand`. This protects units already reserved for customer demand.

### 3. Review

The user sees:

- source location,
- destination location,
- all selected variants,
- quantity per variant,
- total units,
- optional transfer/dispatch note.

Immediately before confirmation every line is re-read from the source-location availability endpoint. If availability fell below the requested quantity, the transfer stops and asks the user to review the quantity.

### 4. Persistence contract

The frontend is intentionally ledger based.

Expected draft request:

```text
POST /inventory/movement-drafts
```

Payload semantics:

```text
type: TRANSFER
sourceLocationId: <source>
destinationLocationId: <destination>
idempotencyKey: admin-transfer:<uuid>
movementNumber: TRF-...
lines: [{ productVariantId, quantity }]
referenceType: ADMIN_TRANSFER
occurredAt: ISO timestamp
note: optional
```

After draft creation:

```text
POST /inventory/movements
{ movementId: <draft-id> }
```

The second command posts the same existing draft. If posting fails after draft creation, retry reuses that draft rather than creating a duplicate movement.

## Existing backend truth

The domain already has `createInventoryMovement`, including:

- idempotency handling,
- movement-shape validation,
- unique variant per movement,
- positive movement quantities,
- movement-line limit,
- draft creation through the inventory repository.

The current application/HTTP surface already supports posting an existing draft movement. The remaining integration task is to expose the existing draft-creation use case through the protected Admin API/HTTP boundary. Do not duplicate inventory rules in a new backend system.

## Required backend integration

Add the smallest correct protected binding for draft creation.

Requirements:

1. Validate a service input derived from `createInventoryMovementInputSchema` with `organizationId` removed from public input.
2. Derive organization from the authenticated execution context.
3. Require inventory mutation permission using the canonical permission model resolved during workforce-auth integration.
4. Call the existing domain `createInventoryMovement` use case/repository path.
5. Record an audit event within the same transaction where appropriate.
6. Return the normal `InventoryMovementContract`.
7. Do not directly update an inventory balance/quantity column.
8. Preserve idempotency behavior.

## Required tests during merge

- source and destination cannot be the same;
- source and destination must belong to the authenticated organization;
- inactive/foreign location cannot be used;
- line variants must belong to the organization;
- duplicate variant lines are rejected;
- zero/negative quantity rejected;
- transfer that would drive source stock below allowed inventory is rejected by authoritative backend rules;
- idempotent retry returns the same draft;
- same idempotency key with different payload conflicts;
- unauthorized workforce principal rejected;
- organization isolation / IDOR test;
- create-draft then post updates source and destination through ledger semantics;
- posting retry is idempotent;
- Admin lint/typecheck/tests/build pass after integration.

## Explicit non-goals

- no direct stock overwrite;
- no fake transfer success;
- no transfer of reserved quantity merely because `onHand` is sufficient;
- no second inventory engine;
- no client-side organization authority;
- no public inventory mutation endpoint.
