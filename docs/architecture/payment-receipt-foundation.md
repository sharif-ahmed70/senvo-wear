# POS Payment and Receipt Foundation

Return and refund receipts are separate immutable documents and never rewrite the original sales or payment receipt. A return receipt records credit at return time; a later refund receipt records money confirmed as issued and preserves its own settlement snapshot.

Later outstanding-balance payments are append-only collections with separate payment receipts. See [POS Outstanding Balance Collection](./pos-outstanding-balance-collection.md). The original payment batch and sales receipt are never updated to represent later collections.

## Purpose

This foundation records accepted checkout-time tenders and issues one durable sales receipt for every new POS checkout. POS remains the cross-domain coordinator; payment owns tender facts and receipt owns the historical document snapshot.

## Atomic checkout flow

One outer Prisma transaction locks and validates the cart, derives current prices and source context, validates payment instructions, creates and fulfills the sales order, consumes inventory, persists checkout and payment records, snapshots the receipt, and appends all audit entries. Repositories receive the injected transaction client. They do not open hidden or nested transactions.

A payment or receipt persistence failure therefore rolls back the order, reservation, inventory movement, checkout, payment batch and lines, receipt and lines, and audit entries.

## Payment ownership

The browser may send only an idempotency key, `allowOutstanding`, and up to eight ordered payment instructions. Supported methods are `CASH`, `CARD`, `MOBILE_BANKING`, and `BANK_TRANSFER`. Non-cash methods require a normalized external reference. Card credentials, PINs, CVVs, expiry values, bank credentials, and mobile banking secrets are never accepted.

The server reloads transaction-fresh cart data and derives organization, staff, session, counter, store or booth, sales channel, currency, line prices, total, identifiers, and timestamps. Amounts use BDT integer minor units and are checked against the PostgreSQL `INTEGER` range.

Due is not a payment method. It is the derived difference between the payable total and accepted tenders. A fully paid checkout is `PAID`; a positive partial payment is `PARTIALLY_PAID`; an explicitly approved zero-payment checkout is `UNPAID`. Any outstanding amount requires both `allowOutstanding` and `PAYMENT.APPROVE`.

## Idempotency and history

Normalized payment lines, their order, and `allowOutstanding` form a deterministic request signature. The same cart, key, and signature replay the completed result. Changed payment content or ordering conflicts. A different key on an already completed cart also conflicts. The cart row lock serializes concurrent retries, while database uniqueness permits one payment batch and one receipt per checkout.

Checkout rows from before this migration are not backfilled. Their safe read projection reports `UNRECORDED` with null paid, outstanding, and receipt fields. A legacy checkout cannot be mutated by replaying a new payment payload.

## Receipt snapshot

The receipt is immutable through current repositories and APIs. It snapshots organization contact data, counter and source names, staff display name, order and customer facts, item names and variants, totals, payment balance, and ordered safe tender references. Later edits to organization, catalog, staff, or counter records do not rewrite receipt history.

Receipt numbers use a server-generated checkout UUID suffix and organization-scoped uniqueness. They do not depend on a current row count or maximum value.

`ReceiptDocument` is a printer-independent domain projection. The admin application renders it as responsive, print-friendly HTML and invokes browser printing outside the domain and transaction boundaries.

## Authorization and audit

Checkout requires `POS.UPDATE`, `SALES.CREATE`, and `PAYMENT.CREATE`. Outstanding sales additionally require `PAYMENT.APPROVE`. Receipt detail requires `RECEIPT.READ` and `PAYMENT.READ`; repository lookup remains organization scoped and returns not found across organization boundaries.

The transaction appends `POS_CHECKOUT_COMPLETED`, `POS_PAYMENT_RECORDED`, and `SALES_RECEIPT_ISSUED`. Audit metadata contains identifiers, status, counts, and minor-unit summaries only. It excludes tender references, customer secrets, and payment credentials. Replays append no duplicate audit entries.

## Deferred boundaries

Gateway authorization, capture, settlement, webhooks, automated provider refunds, reversals, chargebacks, post-checkout due collection, tax, discounts, cash drawers, cash change, accounting, customer CRM, receipt printer drivers, USB communication, and label printing remain outside this milestone.
