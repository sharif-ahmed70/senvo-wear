# ADR-017: POS Counter Identity Boundary

Date: 2026-07-02

## Status

Accepted

## Context

POS counters need stable identity before sales, shifts, devices, and cashier assignment can be modeled.

## Decision

POS counters are branch-scoped operational identities with organization-wide codes. They do not include cashier assignment, shifts, opening cash, hardware identifiers, device tokens, sales, or payment state.

## Consequences

Future POS workflows can reference counters safely without coupling this slice to authentication, sales, payments, or device management.

## Alternatives Considered

Branch-scoped code uniqueness was rejected for now because organization-wide uniqueness keeps operational references simpler across reports and support workflows.
