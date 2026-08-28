# SENVO POS — New Sale Approved Design

Status: approved visual direction and frontend handoff.

## Approved scope

The `/pos/sell` cashier workspace uses the approved compact POS visual hierarchy while preserving the existing production-facing behavior:

1. active sales counter/session context
2. barcode-first item entry
3. cart line review
4. quantity change and removal
5. order item count/subtotal/total
6. transition to the existing payment step

## Backend-aligned behavior preserved

The current implementation continues to use the existing `AdminApiClient` POS operations and does not introduce parallel business logic. The backend remains authoritative for active barcode identity, variant sellability, availability, pricing, checkout, inventory consumption, payment, receipt, permissions, audit, and idempotency.

The existing checkout domain flow creates the POS sales order, reserves stock, confirms and fulfills the order, consumes inventory through the established sales/inventory flow, records payment state, and issues a receipt.

## Intentionally not implemented from visual exploration

The approved visual reference contained exploratory controls that are not supported by the current POS contract. They must not be implemented as fake frontend features:

- product-name/SKU catalog search inside New Sale
- customer search/CRM attachment
- sale-level or line-level discount editing
- hold/suspend sale
- arbitrary order notes
- fake product-grid inventory counts

New Sale remains barcode-first until corresponding backend contracts are intentionally added and approved.

## Existing supported payment behavior

The existing payment step supports Cash, Card, Mobile Banking, and Bank Transfer, including multiple payment lines. Outstanding balance is permission-gated and must continue to require the backend approval permission.

## Follow-up designs in this POS module

Complete these before moving to the next module:

1. Take Payment / split-payment screen
2. Sale Success / receipt and next-sale state
3. Checkout History
4. Checkout Detail / outstanding payment collection
5. Return flow
6. Refund flow
7. receipt surfaces
8. Sales Sessions
9. Sales Counters
10. responsive/accessibility pass

Each follow-up keeps the same rule: design approval first, then frontend implementation using existing backend capability.
