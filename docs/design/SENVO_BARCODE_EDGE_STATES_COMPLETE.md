# SENVO Barcode Edge States — Complete

This closes the approved Barcode Management UX module before moving to Inventory.

## Completed frontend behavior

- Scanner lookup has isolated states for idle, loading, found, not-found, and operational/API failure.
- A not-found scan does not pollute the whole page with a global error.
- Scanner copy explicitly explains that active barcode identity is authoritative.
- Active barcode deactivation requires confirmation.
- Deactivation keeps historical barcode records and does not alter inventory.
- Variants with inactive barcode history expose a restore action.
- Reactivation performs a fresh server read before mutation and refuses to proceed if another active barcode now exists.
- Database/backend uniqueness remains authoritative for race conditions.
- Row status distinguishes `Assigned`, `Inactive barcode`, and `No barcode`.
- CSV export includes active barcode status and previous-barcode count.
- Existing generated-barcode flow remains: Select Variants → Review & Confirm → Generate → Print Labels.

## Important backend boundaries

- No stock mutation is performed by barcode create/deactivate/reactivate/print operations.
- No fake printed-label history or printed-label analytics is introduced.
- Barcode identity is variant-level.
- Backend/API uniqueness rules are never replaced by frontend-only checks.

## Integration note

The design branch still composes Admin routes with the existing preview session fixture. The workforce-auth branch must replace route/session composition during integration without changing the barcode business flow.

Before merge, run Admin lint/typecheck/build and targeted barcode API/UI verification in the real working tree.
