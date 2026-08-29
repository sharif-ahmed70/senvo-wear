# SENVO Barcode Management — Approved Design Handoff

Status: approved main workspace; generation/print subflows pending visual approval
Branch: `design/admin-ux-system`

## Product intent

Barcode Management identifies existing sellable product variants. It does not create products, does not create stock, and does not replace inventory truth.

Real-life flow:

Catalog product/variant -> barcode identity -> receive/scan/sell through Inventory and POS.

## Approved main workspace

The approved visual direction is the premium SENVO Admin system:

- charcoal navigation shell;
- warm ivory operational canvas;
- restrained burgundy actions;
- green only for healthy/assigned state;
- amber/red only for attention;
- editorial headings paired with compact operational typography;
- dense but calm tables;
- responsive desktop/tablet/mobile behavior.

## Existing real implementation reused

The current Barcode workspace already uses `AdminApiClient` and real backend contracts for:

- product listing;
- product detail and variants;
- variant barcode listing;
- barcode scanner/manual lookup;
- barcode status changes;
- CSV export of the selected product's barcode data.

Do not replace these with mock runtime data.

## Main actions

### Scan Barcode

Opens a scanner/manual-entry dialog. Keyboard-style scanners can submit the barcode value. Lookup is server-authoritative.

### Generate Barcodes

Target route: `/catalog/barcodes/generate`.

This flow must be visually approved before implementation. It must operate only on existing variants that do not already have an active barcode.

### Generate Selected

Carries the selected missing-barcode variant IDs into the Generate flow. Assigned variants remain ineligible.

### Export

Exports currently loaded real barcode rows as CSV. It does not mutate backend state.

### Row action

Any deactivate/reactivate action must be explicit and confirmed enough that an overflow-menu click can never silently change identity state.

## Backend invariants

- Barcode identity belongs to a product variant.
- One active barcode per variant is enforced by backend rules.
- Duplicate barcode values must be rejected by backend uniqueness rules.
- SKU and barcode are distinct identities.
- Barcode generation must not create or overwrite inventory.
- Barcode status changes must preserve historical references.
- Browser state is not the source of truth.

## Metrics rule

Only render metrics derivable from actual backend data. Do not display fake "printed labels this month" or other print-history metrics until a persistent print-history/read model exists.

The current safe metrics are product/variant/barcode readiness values derived from loaded catalog data.

## Media rule

Use real product/variant media when available through existing product media contracts. Never commit demo product photography as production catalog truth.

## Pending subflows — finish before leaving Barcode module

1. Generate Barcodes — Select Variants
2. Generate Barcodes — Review & Confirm
3. Generate Result / partial-failure-safe state
4. Print Labels
5. Scan Barcode result/detail state
6. Barcode row action menu/status change UX
7. empty/loading/error/access-denied states
8. responsive/accessibility pass

## Print boundary

The repository has barcode identity support, but printed-label history or a hardware-specific printer driver must not be invented. Browser print/PDF/label-sheet preparation may be implemented as presentation when approved. Hardware adapter work stays behind infrastructure boundaries.

## Integration handoff

When this design branch is merged with workforce-auth work:

- replace preview Admin session use with the real workforce principal;
- retain backend permission enforcement;
- retain existing barcode APIs/contracts;
- do not add Prisma/browser authority;
- run Admin lint, typecheck, tests and build;
- verify barcode database/integration tests where backend changes are introduced.
