# ADR-019: Immutable Operational Codes

Date: 2026-07-02

## Status

Accepted

## Context

Branch, stock location, and POS counter codes are human-visible operational identifiers. Future documents, reports, integrations, and POS references may store or display them.

## Decision

Operational codes are immutable after creation in this phase.

## Consequences

Metadata updates cannot rename codes. Correcting a bad code requires a future explicit correction workflow with audit and reference rules.

## Alternatives Considered

Allowing code updates was rejected because it can create ambiguous historical references before audit workflows exist.
