# ADR-008: API Contract And Error Standard

Date: 2026-07-01

## Status

Accepted

## Context

Future storefront, admin, and POS workflows need consistent API responses without coupling transport DTOs to domain or database records.

## Decision

Use discriminated API response contracts, stable error-code categories, safe public error serialization, request IDs, and Zod validation for transport boundaries.

## Consequences

Clients can handle responses predictably. Internal errors must be mapped to public errors at presentation boundaries.

## Alternatives Considered

Ad hoc per-route response shapes were rejected because they make client and audit behavior inconsistent.
