# ADR-064: Full Sales Order Line Replacement

## Status

Accepted

## Decision

Draft order line amendment replaces the complete line set instead of patching individual lines.

## Rationale

Full replacement gives one deterministic total calculation, avoids line identity ambiguity, and keeps optimistic concurrency simple. Partial patching can be introduced later with explicit line identity and audit rules.

## Consequences

The client must send the final intended draft line set. The repository deletes old draft lines and inserts the replacement lines atomically.
