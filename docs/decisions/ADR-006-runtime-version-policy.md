# ADR-006: Runtime Version Policy

Date: 2026-07-01

## Status

Accepted

## Context

The bootstrap selected Node.js 24.18.0. Production stability benefits from an active LTS runtime supported by all selected tools.

## Decision

Use Node.js 22 LTS for the repository runtime target. Developer engines allow `>=22.13` because pnpm 11 requires Node `>=22.13` and local machines may have a newer compatible runtime; CI pins `22.23.1` for deterministic verification.

## Consequences

Local machines may use newer Node versions for exploratory work, but CI verifies Node 22. Commands in this hardening pass were run under local Node 24.18.0 and must not be described as Node 22 verification.

## Alternatives Considered

Node 24 LTS was considered because it is currently available, but Node 22 remains a stable LTS line and satisfies Next.js, Prisma, Vitest, Turborepo, pnpm, and TypeScript requirements.
