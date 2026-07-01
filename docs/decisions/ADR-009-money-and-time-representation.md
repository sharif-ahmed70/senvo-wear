# ADR-009: Money And Time Representation

Date: 2026-07-01

## Status

Accepted

## Context

SENVO Wear will eventually handle pricing, sales, payments, refunds, procurement, and reporting.

## Decision

Use integer minor units for API money values and avoid JavaScript floating-point arithmetic for financial calculations. Persist timestamps in UTC, use `Asia/Dhaka` for business reporting, and keep calendar dates distinct from instants.

## Consequences

Money and time handling must be explicit in future modules. Multi-currency is not implemented, but currency codes are included in contracts.

## Alternatives Considered

Floating-point money values were rejected. PostgreSQL `numeric` remains available for future reviewed cases where integer minor units are insufficient.
