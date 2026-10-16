# SENVO Catalog — Approved UX and Integration Handoff

Status: approved design implementation on `design/admin-ux-system`.

## Purpose

Catalog answers one operator question: **what does SENVO sell?**

Inventory remains separate and answers: **how much stock exists and where?**

Barcode remains separate and answers: **how is a sellable variant identified?**

The Catalog UI must never expose a direct editable stock balance.

## Approved Catalog experience

Route: `/catalog`

The page uses the real Admin catalog API and provides:

- premium SENVO merchandising visual system;
- real product list;
- real category names;
- real primary product media where available;
- search by product name, product code, or category;
- category and lifecycle-status filtering;
- client-side pagination for the current catalog list contract;
- real product lifecycle counts from `listProducts()`;
- bounded hydration of visible product details;
- visible variant count from `getProduct()`;
- barcode readiness for visible rows from `listVariantBarcodes()`;
- loading, error, retry, empty and filtered-empty states;
- product-detail links;
- shortcuts to Add Product, Barcodes and Inventory;
- categories, collections, colors and sizes remain dedicated existing workspaces.

The current list contract does not expose a purpose-built catalog aggregate read model. If scale makes visible-row hydration too expensive, integration work should add a narrow organization-scoped read projection rather than move business truth into the browser.

## Add Product interaction

Primary action: `/catalog/products/new`.

The flow is intentionally a four-step merchandising setup:

1. **Basics**
   - product/customer-facing name;
   - stable product code;
   - category;
   - optional collection;
   - initial lifecycle state;
   - description.

2. **Variants**
   - one or more color/size combinations;
   - one SKU per sellable variant;
   - client validation for missing fields, duplicate SKUs and duplicate color/size combinations;
   - barcode is deliberately not typed here.

3. **Media**
   - real JPEG/PNG/WebP files only;
   - backend-aligned 5 MB file limit;
   - one primary image;
   - gallery media;
   - optional variant-specific gallery assignment;
   - accessible alt text;
   - browser preview before persistence.

4. **Review**
   - product identity;
   - category/collection;
   - variant/SKU summary;
   - media summary;
   - explicit reminder that stock is not created here.

## Real persistence sequence

The design implementation uses the existing `AdminApiClient` rather than a mock API:

1. `createProduct(...)`
2. `createVariant(...)` for each approved variant
3. `setPrimaryProductImage(...)` when a primary image exists
4. `addProductMedia(...)` for gallery/variant media

Media requests use the existing idempotency-key contract and backend-supported content types.

The UI does not claim a cross-resource transaction that the backend does not provide. If the product record is created but a later variant/media operation fails, the user receives a **partial setup** recovery state with a link to the real created product. It does not falsely report that the whole operation rolled back.

## Success handoff

After successful creation the user gets natural next actions:

- **View product**
- **Generate barcodes**
- **Receive opening stock**
- **Add another product**

This models the real shop workflow:

`Catalog product → Variants/SKUs → Barcode identity → Inventory receipt → POS/Storefront availability`

## Backend authority preserved

- category/color/size/collection options come from real APIs;
- browser does not import Prisma;
- product/media contracts remain `@senvo/contracts` driven;
- stock is never directly overwritten;
- barcode values are not fabricated by the product form;
- product media uses the real media endpoints;
- backend validation, organization scope and authorization remain authoritative;
- workforce-session transport should be merged from the authentication work, not reimplemented in this design branch.

## Integration follow-up for Cline

When this branch is integrated after workforce auth lands:

1. preserve the approved UI/interaction flow;
2. replace any remaining preview-session composition with the real workforce session;
3. ensure `AdminApiClient` sends the final workforce cookie/session transport correctly;
4. keep backend permission enforcement authoritative;
5. consider a narrow catalog list/read model only if production scale makes visible-row detail hydration unsuitable;
6. run Admin lint, typecheck, tests and build before merge.
