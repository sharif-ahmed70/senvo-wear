# Draft Sales Order Amendment

Draft sales order amendment is a controlled pre-reservation operation. It allows commerce workflows to correct buyer/contact snapshots, delivery snapshots, order note, allocation policy, order-level charges, and the complete line set before inventory is reserved.

Only `DRAFT` orders are amendable. Once an order is `RESERVED`, `CONFIRMED`, `CANCELLED`, or `FULFILLED`, the sales order is part of the inventory coordination flow and must not be mutated by amendment commands.

## Editable Data

Metadata amendment supports optional replacement or clearing for nullable customer/contact, delivery address, note, allocation policy, order discount, and delivery charge fields. Omitted fields are left unchanged. `null` clears nullable fields.

Line amendment is full replacement. The caller submits the complete desired line set, and the server validates every variant, reloads catalog display data, replaces all existing draft lines, and recomputes totals in one transaction.

## Immutable Data

Amendments never accept or change order identity, organization identity, order number, channel, currency, idempotency key, payload signature, creation timestamp, lifecycle status, reservation linkage, fulfillment linkage, lifecycle timestamps, direct version values, totals, or snapshot text.

## Allocation Policy

Draft orders may clear `allocationPolicyId` or assign an active policy from the same organization. Inactive or archived policies are rejected during amendment so the order does not store unusable reservation configuration.

## Money

Totals use integer BDT minor units:

```text
lineGrossMinor = quantity * unitPriceMinor
lineTotalMinor = lineGrossMinor - lineDiscountMinor
subtotalMinor = sum(lineTotalMinor)
totalMinor = subtotalMinor - orderDiscountMinor + deliveryMinor
```

All arithmetic is safe-integer checked and constrained to the database integer range. Negative line totals and negative order totals are rejected.

## Concurrency

Every amendment requires `expectedVersion`. The repository locks the organization-scoped order row, verifies `DRAFT`, verifies the expected version, applies all requested changes, and increments the order version once. A retry with a stale version returns a concurrency conflict; the caller must re-read the order before attempting another amendment.
