# ADR-007: Prisma Environment Policy

Date: 2026-07-01

## Status

Accepted

## Context

Prisma 7 loads `prisma.config.ts` for CLI commands. Schema validation and client generation do not need a live database, but migration and runtime access do.

## Decision

Use an explicit invalid placeholder datasource only for non-production Prisma `generate` and `validate` when `DATABASE_URL` is absent. Runtime access, staging/production commands, migrations, and `db push` require a real `DATABASE_URL`.

## Consequences

CI can validate and generate the client without secrets. Production and staging fail clearly when database configuration is missing.

## Alternatives Considered

A silent localhost fallback was rejected because it could hide missing configuration or target an unintended local service.
