# SENVO Barcode Generation — Implemented Design Handoff

Status: **APPROVED UI + FRONTEND IMPLEMENTED ON DESIGN BRANCH**

Branch: `design/admin-ux-system`

## User workflow

`Barcode Management → Generate Barcodes → Select Variants → Review & Confirm → Persist → Print Labels → Inventory`

## Real backend bindings used

The frontend uses the existing Admin API client and contracts:

- `listProducts()`
- `getProduct(productId)`
- `listColors()`
- `listSizes()`
- `listVariantBarcodes(variantId)`
- `createVariantBarcode({ variantId, type, value })`
- `lookupBarcode(value)` from the management screen
- `updateBarcodeStatus(...)` from the management screen

No Prisma/database access exists in the Admin frontend.

## Barcode generation

Generated values use `CODE128`, which is already allowed by SENVO contracts.

The browser creates a high-entropy SENVO value and the database remains authoritative for:

- global barcode value uniqueness;
- one ACTIVE barcode per variant;
- organization-scoped variant ownership.

A conflict response causes the frontend to generate a new value and retry a limited number of times. Other failures are not blindly retried.

## Partial-success behavior

Bulk creation is performed through existing per-variant backend calls. If several barcodes are created and a later request fails, the UI does **not** pretend the earlier records rolled back. It reports the partial completion and instructs the operator to refresh before retrying.

A future transactional bulk endpoint may replace this behavior if the backend adds one.

## Label printing

The workflow contains a real CODE128-B SVG renderer and browser-print layout.

Supported handoff label sizes:

- 40 mm × 30 mm
- 50 mm × 30 mm
- 50 mm × 40 mm

Options:

- 1–10 copies per variant;
- show/hide product name;
- show/hide SKU;
- A4 print-sheet layout.

Printing is presentation-only. It does not alter barcode state, inventory quantity, reservations, or movement history.

The UI intentionally does **not** show a fake `printed labels this month` metric because the current backend does not persist print events.

## Existing management actions

The Barcode Management workspace already provides:

- product search;
- variant barcode readiness;
- assigned/missing filter;
- CSV export;
- keyboard-style scanner/manual barcode lookup;
- generate-all / generate-selected navigation;
- active barcode status management;
- loading, empty, error and permission states.

## Authorization handoff

The design branch still uses the pre-existing `adminFoundationSession` at route composition points because workforce authentication is being implemented separately in the active local Cline task.

When integrating this branch, Cline must replace that preview composition with the real workforce session/principal without changing the barcode domain behavior.

## Verification required at integration time

Before merge into the implementation branch, run the repository's real Admin gates:

- Admin lint;
- Admin typecheck;
- Admin tests;
- Admin build;
- relevant barcode API/database tests;
- `git diff --check`.

Do not claim those gates passed from this design branch alone; this GitHub design session cannot execute the user's local pnpm/PostgreSQL environment.
