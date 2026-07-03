# ADR-063: Draft-Only Sales Order Amendment

## Status

Accepted

## Decision

Sales order amendment is allowed only while the order is `DRAFT`.

## Rationale

After reservation, the order participates in inventory coordination. Mutating reserved, confirmed, cancelled, or fulfilled orders would require reservation release/recreation, movement compensation, payment implications, or audit history that belongs to later workflows.

## Consequences

Callers must amend before reservation. Non-draft amendments return a business-rule failure and do not alter reservation, cancellation, or fulfillment state.
