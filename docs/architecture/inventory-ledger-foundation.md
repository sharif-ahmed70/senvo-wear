# Inventory Ledger Foundation

SENVO Wear inventory starts with an immutable ledger. A posted inventory movement is the source of truth for stock changes. On-hand quantity is derived from posted movement lines and is not stored as an independently editable value.

This foundation supports only:

- OPENING
- RECEIPT
- ISSUE
- TRANSFER
- ADJUSTMENT_IN
- ADJUSTMENT_OUT

Procurement, sales, returns, reservations, costing, valuation, batch, serial, and finance workflows remain outside this phase.

## Movement Lifecycle

Movements are created as DRAFT with at least one line. Draft lines may be replaced before posting. Posting changes the movement to POSTED and sets `postedAt`.

Posted movements and lines are immutable. Corrections must be represented later through compensating movements. Voiding is not implemented in this phase, so no unused VOIDED status is introduced.

## Eligibility

Posting requires:

- active organization
- same-organization stock locations
- active source and destination locations
- same-organization product variants
- product variants that are not ARCHIVED

Sellability does not determine inventory eligibility. A non-sellable hold location may still hold stock. Branch status is not rechecked during posting because the current operational lifecycle keeps location state explicit; inventory eligibility follows the stock location status.

## Negative Stock

Negative on-hand is prohibited. ISSUE, TRANSFER, and ADJUSTMENT_OUT recompute source balance in the posting transaction and fail when requested quantity exceeds available quantity.

## Idempotency

The idempotency key belongs to movement creation. `organizationId + idempotencyKey` is unique. A deterministic payload signature is stored with the movement so retries with the same intended command return the existing movement while conflicting payloads fail.
