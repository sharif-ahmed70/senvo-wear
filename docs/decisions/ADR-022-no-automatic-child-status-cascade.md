# ADR-022: No Automatic Child Status Cascade

Date: 2026-07-02

## Status

Accepted

## Context

Branches own stock locations and POS counters, but changing a branch status does not always imply the correct lifecycle state for every child record.

## Decision

Branch lifecycle changes do not automatically cascade to stock locations or POS counters. Branch deactivation and archival are blocked until child records are in compatible states.

## Consequences

Operators must make child lifecycle decisions explicitly. This avoids accidentally disabling or archiving operational identities that may need separate review.

## Alternatives Considered

Automatic child cascade was rejected because it hides operational decisions and can create surprising downstream effects.
