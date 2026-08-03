# ADR-095: Separate the POS Operational Boundary

## Status

Accepted

## Context

SENVO Wear already has branch-level counter metadata, catalog barcodes, inventory availability, and sales source history. Offline selling needs a narrower operational lifecycle: a store or booth counter, an active staff session, and a temporary server-priced cart. Reusing organization configuration records directly would couple UI configuration to sales history and make future scanner, printer, payment, and order workflows harder to isolate.

## Decision

Create a POS bounded context with organization-scoped `SalesCounter`, `SalesSession`, `PosCart`, and `PosCartLine` records. A sales counter references either a branch or a booth. A session is opened by the authenticated context user, has one cart, and is unique while open for its counter. Catalog owns barcode identity, inventory owns availability, and POS consumes both through contracts. Prices and line subtotals are selected and calculated on the server.

The API accepts no organization, staff identity, role, permission, price, or subtotal fields from the browser. All records use restrictive foreign keys and preserve closed history.

## Consequences

- POS operations remain replaceable behind the HTTP and API boundaries.
- Existing organization counter behavior is unchanged.
- A minimal variant selling price is required before a cart can be priced.
- Opening a session includes an infrastructure transaction to create its cart atomically.
- Payment, inventory deduction, sales-order conversion, hardware drivers, and receipt output remain future decisions.
