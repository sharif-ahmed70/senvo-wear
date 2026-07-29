# ADR-087: Admin Application Separation

## Status

Accepted

## Decision

Keep the SENVO Wear administration experience in `apps/admin` as a dedicated Next.js application. The admin app consumes browser-safe contracts through a typed HTTP client and may use shared UI primitives, but it cannot import domain, application-service, database, Prisma, or server HTTP-adapter modules.

## Rationale

A separate application boundary keeps internal operational workflows independent from the storefront and POS experiences. The HTTP API remains the integration point, preserving backend authentication, validation, authorization, transaction, and audit guarantees.

## Consequences

Permission-aware navigation improves usability but never grants access. Backend authorization remains authoritative for every operation. The temporary foundation session must be replaced by a trusted authenticated server integration before production use.
