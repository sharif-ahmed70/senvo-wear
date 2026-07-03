# ADR-038: Available-To-Sell Derived From Active Reservations

Status: Accepted

Available-to-sell is derived as posted on-hand minus active reserved quantity.

The system does not store an independently editable available quantity. This avoids drift between the ledger, reservations, and availability reads.
