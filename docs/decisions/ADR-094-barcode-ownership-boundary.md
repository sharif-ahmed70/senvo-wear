# ADR-094: Barcode Ownership Boundary

## Status

Accepted

## Decision

The catalog domain owns variant barcode identity, validation, lifecycle, and lookup. Each value is globally unique, each product variant has at most one active barcode, and inactive records remain immutable history except for explicit lifecycle status changes.

Barcode lookup is organization scoped and resolves active catalog identity only. Trusted application context supplies the organization and authorization; transport clients cannot provide organization identity, actor identity, or permissions.

Hardware and POS integrations consume the catalog lookup boundary. Scanner listeners, barcode rendering, Xprinter XP-T361U transport, label templates, receipt rendering, and order-line creation remain separate replaceable adapters or application workflows.

## Consequences

- A scan has one unambiguous active variant result within an organization.
- Inactive values cannot accidentally select products but remain available for audit and administration.
- Database uniqueness and restrictive ownership protect integrity if application checks are bypassed.
- Catalog lookup can evolve independently from inventory, sales, POS, and printer implementations.
- React and HTTP adapters contain no barcode business rules or direct database access.
