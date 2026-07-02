# ADR-020: Archived Terminal Lifecycle

Date: 2026-07-02

## Status

Accepted

## Context

Operational records should remain available for history after they stop being used.

## Decision

`ARCHIVED` is terminal for branches, stock locations, and POS counters in this phase. Archived records are not physically deleted and cannot be reactivated.

## Consequences

Lifecycle is predictable and conservative. Reactivation workflows can be designed later only if audit and business approval rules require them.

## Alternatives Considered

Allowing archive reversal was rejected because it weakens the meaning of archived before audit workflows exist.
