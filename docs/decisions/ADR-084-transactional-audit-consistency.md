# ADR-084: Transactional Audit Consistency

## Status

Accepted

## Decision

Sales order creation and inventory movement posting must persist their business state and audit evidence through one database transaction. The application depends on a generic transaction manager; only the database package knows the Prisma transaction client.

The transaction manager creates scoped repositories and a scoped audit writer from the injected transaction client. These implementations do not start hidden or nested transactions. Authorization executes inside the callback, while transport authentication remains outside the database transaction.

## Consequences

An audit insert failure rolls back the business write, and a later operation failure rolls back both. The approach remains a modular-monolith transaction boundary and does not introduce events, queues, or distributed consistency mechanisms. Additional business operations require explicit future integration.
