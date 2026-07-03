# ADR-036: Inventory Reversal Actor Identity Deferred

## Status

Accepted

## Decision

Inventory reversal records do not store actor identity until authentication exists.

## Consequences

Current audit metadata includes original movement, reversal movement, reason, occurred timestamp, created timestamp, posted timestamp, reference pair, and idempotency key. Future authentication work can add trusted actor identity without relying on arbitrary actor strings.
