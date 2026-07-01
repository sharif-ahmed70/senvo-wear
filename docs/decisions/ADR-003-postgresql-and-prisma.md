# ADR-003: PostgreSQL And Prisma

Date: 2026-07-01

## Status

Accepted

## Context

SENVO Wear will need relational consistency for inventory, orders, procurement, payments, and finance workflows.

## Decision

Use PostgreSQL with Prisma ORM. The foundation follows Prisma 7 ESM, generated-client output, and PostgreSQL driver-adapter patterns.

## Consequences

Schema changes must be reviewed as migrations. Application code should use a database package boundary instead of importing generated clients directly.

## Alternatives Considered

Document databases and direct SQL-only access were deferred. They may be revisited for analytics or reporting needs later.
