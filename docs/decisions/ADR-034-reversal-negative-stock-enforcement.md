# ADR-034: Inventory Reversal Enforces Negative-Stock Policy

## Status

Accepted

## Decision

Reversal movements use the same negative-stock protection as normal posted movements.

## Consequences

Reversing inbound stock can fail if later activity consumed that stock. The failure leaves the original movement and ledger unchanged.
