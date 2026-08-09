# ADR-100: Append-only Checkout Refund Settlement

## Status

Accepted

## Context

Merchandise returns create checkout-level credit, but do not prove money was returned. Multiple returns and multiple refund issuances can contribute to one checkout settlement. Rewriting original payments or attaching refund ownership to one return would erase financial history or misrepresent that relationship.

## Decision

Record each confirmed refund as a new immutable `PaymentRefund` with ordered lines and one immutable receipt. Own refunds by checkout and organization. Derive gross received, cumulative refunded, net received, amount due, and refund due with the shared settlement calculator.

Returns, payment collections, and refunds serialize on the same organization-scoped checkout row lock inside one outer transaction. Refund idempotency is organization + checkout + key with a normalized line signature. A new refund appends one audit event; replay appends none.

Non-cash records are staff confirmation of an already-issued external refund, not evidence of provider execution. Provider adapters and automated status workflows are deferred.

## Consequences

Financial and receipt history remains reconstructable and tenant safe. Live settlement reflects refunds without changing historical received values. Refund issuance requires trusted payment approval and cannot exceed transaction-fresh refund due. Provider reconciliation and reversal workflows will require future additive events rather than edits to these records.
