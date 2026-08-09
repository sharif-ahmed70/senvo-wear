# ADR-101: Storefront Commerce Ownership Boundary

## Status

Accepted.

## Decision

Public Storefront requests resolve one ACTIVE organization from trusted server configuration. Guest cart state remains in browser storage. Checkout composes the existing SalesOrder and inventory reservation lifecycle in one transaction and persists only a one-to-one commerce profile for `STOREFRONT` and `CASH_ON_DELIVERY`.

COD is an unpaid preference and does not create POS payment records. Public availability is coarse, while transaction-fresh reservation logic remains checkout authority.

## Consequences

The MVP avoids duplicate cart, order, inventory, and payment systems. Future host-to-organization resolution and online payment providers can extend the boundary without accepting tenant or payment authority from browsers.
