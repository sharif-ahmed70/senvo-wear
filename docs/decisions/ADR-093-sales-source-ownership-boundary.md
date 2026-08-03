# ADR-093: Sales Source Ownership Boundary

## Status

Accepted

## Decision

The sales domain owns the canonical source and optional booth reference recorded on a sales order. Temporary booth identity is an organization-scoped sales entity with retained history and an active/inactive lifecycle.

New orders use `ONLINE`, `OFFLINE_STORE`, or `EVENT_BOOTH`. Existing `POS` and `MANUAL` values remain readable and are not silently remapped. Event booth orders require a same-organization booth; all other sources prohibit a booth reference.

Responsible staff identity is derived from trusted application context. Transport clients cannot provide it.

## Consequences

- Historical sales attribution survives booth deactivation.
- Dashboard queries can aggregate by source and booth without UI-side joins.
- Legacy source data remains accurate while canonical writes move forward.
- POS, scanner, barcode lookup, label printing, and receipt printing can be added as replaceable adapters without changing source ownership.
