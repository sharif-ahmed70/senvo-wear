# ADR-054: No Split Allocation Fulfillment

Status: Accepted

Allocation does not split a request across locations, create partial reservations, backorder, substitute variants, or create transfer movements.

Those workflows need explicit sales, fulfillment, and transfer models. Until those exist, allocation remains a deterministic single-location reservation decision.
