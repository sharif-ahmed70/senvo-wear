# ADR-068: Application Service Boundary Before HTTP

## Status

Accepted

## Decision

Introduce `@senvo/application` as a server-only application service boundary before adding HTTP adapters.

## Rationale

Sales workflows need reusable orchestration for future admin, POS, storefront, and job adapters. Keeping this layer independent from HTTP avoids coupling domain use cases to transport concerns.

## Consequences

Adapters call application services and map result objects to their own response format. Domain use cases remain free of HTTP, React, Next.js, and Prisma dependencies.
