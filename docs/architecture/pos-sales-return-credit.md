# POS Sales Return and Credit

## Ownership

A completed POS sale stays immutable. Its fulfilled sales order, fulfillment `ISSUE`, checkout-time payment batch, payment collections, sales receipt, and payment receipts remain historical facts. A merchandise return is an append-only `PosSaleReturn` with immutable lines and one immutable return receipt.

The foundation records financial credit but does not issue money. When the customer has paid more than the adjusted sale value, the read model says **Refund due**, never refunded.

## Inventory flow

Partial returns do not use full inventory movement reversal. Each return creates and posts one `ADJUSTMENT_IN` containing only returned quantities. The destination is server-validated in the same organization with `ACTIVE`, `RETURN_HOLD`, and `isSellable = false`. The original fulfillment movement is not changed or marked reversed.

## Quantity and credit

Remaining quantity is sold quantity minus all prior completed return quantities. Checkout-row locking makes this transaction-fresh. Given original line total `T`, sold quantity `Q`, already returned quantity `R`, and new quantity `N`:

```text
new credit = floor(T * (R + N) / Q) - floor(T * R / Q)
```

Integer arithmetic prevents rounding drift. Repeated partial returns cannot exceed the original line total, and a fully returned line receives exactly its original line total. POS tax, delivery, and order-discount allocation must be revisited before those features become active.

## Adjusted settlement

```text
adjusted payable = original payment-batch payable - completed return credit
cumulative received = checkout payment + payment collections
amount due = max(adjusted payable - cumulative received, 0)
refund due = max(cumulative received - adjusted payable, 0)
```

The original `PaymentBatch` status is not rewritten. `PaymentAccount`, checkout projections, return results, and payment collection validation use the shared settlement calculation. Payment collection therefore cannot collect more than the adjusted amount due.

## Transaction and retry boundary

Return creation and payment collection both lock the organization-scoped checkout row with `FOR UPDATE`. Return-versus-return, return-versus-collection, and collection-versus-collection operations serialize there. One outer Prisma transaction posts inventory, creates return history and receipt, and appends audit. There are no nested transactions.

Idempotency uniqueness is organization + checkout + key. A normalized signature contains destination, reason, normalized note, and sorted line IDs/quantities. Matching retries replay; a different payload conflicts. Replays do not duplicate stock, credit, receipts, or audit.

## Security and legacy behavior

The browser supplies only destination, reason, note, sales-order line IDs, quantities, and idempotency key. Organization, staff, prices, credit, totals, movement identity, settlement, and timestamps come from trusted context and server records.

Creation requires `POS.UPDATE`, `SALES.UPDATE`, `INVENTORY.CREATE`, and `PAYMENT.APPROVE`. Reads use relevant POS, sales, payment, and receipt permissions. Legacy checkouts without canonical payment history cannot be returned.

Successful new returns append `POS_SALE_RETURN_RECORDED`. Notes are excluded from audit metadata. Actual refunds, exchanges, return approval, QC disposition, and restocking from Return hold remain deferred.
