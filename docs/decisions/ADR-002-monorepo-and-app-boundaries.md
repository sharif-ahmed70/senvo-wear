# ADR-002: Monorepo And App Boundaries

Date: 2026-07-01

## Status

Accepted

## Context

The storefront, admin app, and POS will share UI primitives, contracts, domain language, and infrastructure boundaries.

## Decision

Use a pnpm workspace managed by Turborepo, with separate Next.js applications under `apps` and shared packages under `packages`.

## Consequences

Shared changes can be tested together. Application boundaries remain explicit and each app can build independently.

## Alternatives Considered

Separate repositories were rejected for now because they would add coordination overhead before the system has stable interfaces.
