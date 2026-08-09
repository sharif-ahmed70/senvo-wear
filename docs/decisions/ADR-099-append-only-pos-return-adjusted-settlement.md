# ADR-099: Keep fulfilled sales immutable and record returns as adjusted settlement events

## Status

Accepted

## Context

POS needs repeated partial merchandise returns without changing fulfilled orders, original inventory issues, payments, or receipts. Full movement reversal would return every checkout line and could make unreviewed merchandise sellable. Returns can also reduce an outstanding balance or create money owed back to the customer.

## Decision

Model each completed return as an append-only `PosSaleReturn`, immutable lines, a posted `ADJUSTMENT_IN` into a non-sellable Return hold, and one immutable return receipt. Allocate line credit cumulatively with integer floor arithmetic from original sales-order line facts.

Derive adjusted payable, amount due, refund due, and settlement status in a shared read-model rule. Preserve the historical payment-batch status. Payment collections and returns lock the same checkout row and execute in one outer transaction. No refund execution is included.

## Consequences

- Fulfilled sale and payment history remain auditable.
- Partial and repeated returns cannot over-return or create rounding gain.
- Returned stock remains unavailable for sale pending a future disposition workflow.
- Payment collection respects return-adjusted debt.
- A positive refundable balance is visible as **Refund due**, but remains unsettled until the refund milestone.
- Future POS discount, tax, and delivery policies require an explicit credit-allocation decision.
