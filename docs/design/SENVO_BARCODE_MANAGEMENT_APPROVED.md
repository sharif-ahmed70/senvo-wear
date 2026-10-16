# SENVO Barcode Management — Approved UX

Status: approved main workspace implementation handoff
Branch: `design/admin-ux-system`

## Product purpose

Barcode Management identifies real catalog variants for receiving, POS scanning, fulfilment and other shop operations. A barcode never creates a product and never changes stock by itself.

## Main workspace

The approved workspace includes:

- premium SENVO Admin visual language;
- product search/selection;
- real product variants and SKUs;
- active barcode value/status;
- assigned/missing filtering;
- select only variants that still need an active barcode;
- scanner lookup using the existing barcode lookup API;
- CSV export of the currently selected product's barcode presentation;
- permission-aware barcode actions;
- responsive loading, empty, error and access-denied behavior.

## Backend reality

The current backend already supports:

- listing products;
- reading a product with variants/media;
- listing barcodes for a variant;
- creating a barcode for a variant;
- activating/deactivating barcode records;
- barcode lookup.

The UI must continue to respect the backend rule that a variant has at most one active barcode identity.

## Deliberate omissions from fake design data

The visual exploration showed a `Printed Labels (This Month)` metric. Current source does not expose authoritative print-history data, so the coded workspace does not invent that metric.

The production integration should add it only if a real printer/label job history read model is introduced later.

## Workflow completion sequence

Finish this module before moving to Inventory:

1. Main Barcode Management workspace — implemented on this branch.
2. Generate Barcodes — select variants.
3. Review generated/assigned values.
4. Persist through the existing barcode API with clear partial-failure handling if requests are not transactional as a group.
5. Print Labels — real scannable output, label size/layout controls and browser/printer handoff.
6. Scan Barcode — lookup modal/workspace and clear not-found/result states.
7. Row actions — deactivate/reactivate, inspect history where supported, print one label.
8. Export — presentation export only; no backend mutation.

## Integration rules

- Never create stock from Barcode Management.
- Never create a product from Barcode Management.
- Never fake successful generation or printing.
- Do not replace backend uniqueness rules with browser-only checks.
- Keep product/variant/SKU identity from real catalog APIs.
- Barcode scanner input is treated as ordinary keyboard input and resolves through the real lookup endpoint.
- Printed labels must encode the stored barcode value accurately.
- Customer and workforce auth boundaries are unrelated to barcode identity and must remain unchanged.

## Performance note

The main screen intentionally loads all products once, then loads detailed variants/barcodes only for the selected product. It does not issue barcode requests for every variant in the entire catalog just to paint global vanity metrics.

If future product scale requires aggregate readiness counts, add a narrow organization-scoped read model/API rather than creating hundreds of browser requests.
