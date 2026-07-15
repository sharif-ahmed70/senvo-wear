# ADR-082: Audit Foundation

## Status

Accepted

## Decision

Important business actions are recorded through a domain-owned `AuditWriter` backed by an organization-scoped append-only repository contract. The first audited actions are sales order creation and inventory movement posting.

Audit entries use application-generated UUIDs, nullable user references, restrictive foreign keys, controlled action/resource values, and JSON metadata that rejects sensitive field names. Event sourcing, analytics, and general logging are not part of this model.

## Consequences

The model can grow by adding controlled actions and resources without coupling business services to Prisma or an HTTP transport. Atomic coordination between business writes and audit writes requires a later transaction boundary.
