# Catalog Barcode Foundation

## Purpose

SENVO Wear assigns barcodes to sellable product variants so future scanner and POS adapters can resolve a scan to one exact catalog option. Barcode identity belongs to the catalog domain; inventory availability and sales behavior remain separate concerns.

## Model

`VariantBarcode` stores the organization, product variant, normalized value, format, lifecycle status, and timestamps. Supported formats are `EAN13`, `UPC`, `CODE128`, and `INTERNAL`.

Barcode values are globally unique. A product variant can have only one active barcode, while inactive records are retained as history. The database enforces the active-record rule with a partial unique index and uses restrictive foreign keys so product variants with barcode history cannot be deleted accidentally.

EAN-13 and UPC values require a valid check digit. Internal values use uppercase letters, digits, dots, underscores, and hyphens. CODE128 values are normalized to uppercase printable characters. Application validation provides useful errors, and database constraints remain the final integrity boundary.

## Lookup Boundary

Lookup accepts a scanned value and resolves only an active barcode in the organization from trusted application context. It returns the variant ID, SKU, product name, color, and size needed for a future order-line workflow. It does not read stock, reserve inventory, create an order, or infer an organization from browser input.

Inactive barcodes never resolve. Listing retains inactive entries so administrators can understand barcode history and reactivate an eligible record.

## API And Admin

Protected catalog handlers expose variant barcode listing and creation, barcode status changes, and active lookup. `CATALOG.READ`, `CATALOG.CREATE`, and `CATALOG.UPDATE` remain backend-enforced requirements. The browser sends barcode format/value or status only; organization identity, actor identity, and permissions are derived from trusted context.

The admin barcode workspace provides product-option selection, creation, status management, and a scan-code test. Product details show whether each option is ready to scan without putting barcode rules in React components.

## Hardware Extension Points

- A keyboard-emulating barcode scanner can submit its completed text value to the lookup endpoint.
- A future POS application can use lookup output to select a variant before invoking sales application services.
- Product label rendering can consume barcode value and format from a read model, independent of printer transport.
- Xprinter XP-T361U support belongs in a replaceable infrastructure adapter that accepts a rendered label or receipt document.
- Receipt printing should consume a finalized sales snapshot and must not query catalog tables directly.

This foundation includes no scanner listener, barcode image generator, printer driver, label template, receipt workflow, or POS workflow.

## Consistency

Barcode writes use repository and application boundaries already established by the monorepo. Organization-scoped composite foreign keys prevent cross-organization variant assignment. Additive migration history remains immutable, and reset/reapply plus drift checks verify the Prisma schema and SQL migration stay aligned.
