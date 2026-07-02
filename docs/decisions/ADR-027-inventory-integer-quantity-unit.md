# ADR-027: Inventory Integer Quantity Unit

## Status

Accepted

## Context

The current catalog represents garments and variants that are counted as discrete units.

## Decision

Inventory movement quantities use positive integers. Decimal and fractional units are not introduced in this phase.

## Consequences

The ledger stays simple and avoids premature unit-of-measure complexity. Future fractional or measured goods would require a separate unit policy.
