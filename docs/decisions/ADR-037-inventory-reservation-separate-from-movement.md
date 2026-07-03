# ADR-037: Inventory Reservation Separate From Physical Movement

Status: Accepted

Inventory reservations are allocation holds, not stock movements.

This keeps the immutable inventory ledger responsible for physical stock changes while reservations model future intent. Creating, releasing, expiring, or confirming a reservation does not mutate on-hand quantity.
