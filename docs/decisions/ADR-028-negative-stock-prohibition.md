# ADR-028: Negative Stock Prohibition

## Status

Accepted

## Context

Allowing negative stock creates ambiguity before procurement, receiving, reservations, and costing are defined.

## Decision

Negative on-hand is prohibited. ISSUE, TRANSFER, and ADJUSTMENT_OUT fail when posting would make any source location/variant balance negative.

## Consequences

Stock deductions must be backed by posted inventory. Organization-configurable negative stock is deferred.
