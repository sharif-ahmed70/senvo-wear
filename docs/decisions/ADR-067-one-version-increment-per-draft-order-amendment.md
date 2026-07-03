# ADR-067: One Version Increment per Draft Order Amendment

## Status

Accepted

## Decision

Each successful draft order amendment increments the sales order version exactly once, even when metadata and lines are amended together.

## Rationale

The combined amendment represents one business edit. Incrementing for internal sub-steps would leak implementation details and make clients reason about partial progress that is not externally observable.

## Consequences

The repository applies metadata changes, line replacement, snapshot refresh, total recomputation, and version increment inside one transaction. Failed amendments leave the prior version unchanged.
