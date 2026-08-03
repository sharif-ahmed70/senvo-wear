# Sales Channel and Booth Foundation

## Purpose

SENVO Wear records the business source of every new sales order as online, permanent store, or temporary event booth. The source belongs to the sales domain and is not inferred later from the application that submitted the order.

## Source Model

Canonical sources are `ONLINE`, `OFFLINE_STORE`, and `EVENT_BOOTH`. Historical `POS` and `MANUAL` values remain readable so existing orders are not rewritten or misclassified. New write contracts accept only canonical sources.

An event booth order requires a booth reference. A non-booth order cannot contain one. The database check constraint and organization-scoped composite foreign key preserve this rule even when infrastructure code changes.

## Booth History

A booth records its name, location, operating dates, responsible staff member, status, version, and timestamps. Booths are organization scoped and use active/inactive lifecycle changes rather than deletion. Inactive booths remain available in history and reporting.

The responsible staff member comes from the authenticated application context. Browser input cannot choose `organizationId`, staff identity, or permissions. The responsible user must have membership in the same organization.

## Read Models

The sales source repository exposes:

- order count and sales total by canonical source;
- order count and sales total by booth;
- complete booth history, including inactive booths;
- a count of legacy-source orders that remain intentionally unclassified.

These queries prepare dashboard reporting without placing aggregation logic in UI components.

## Hardware Extension Points

Future POS adapters can attach to existing application and HTTP boundaries:

- a keyboard-emulating barcode scanner can submit a scanned value to a product barcode lookup use case;
- product barcode lookup should resolve an organization-scoped active variant before order line creation;
- thermal label output should consume a renderer-owned label document and a replaceable printer transport;
- receipt output should consume a finalized sales snapshot and a replaceable receipt printer transport;
- Xprinter XP-T361U integration belongs in an infrastructure adapter, not domain or admin UI code.

No scanner, printer driver, barcode workflow, or receipt workflow is implemented by this foundation.

## Security

Sales source reads require `SALES.READ`, booth creation requires `SALES.CREATE`, and status changes require `SALES.UPDATE`. Backend authorization remains authoritative; admin navigation checks only control visibility.
