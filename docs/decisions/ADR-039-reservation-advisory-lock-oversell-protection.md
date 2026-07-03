# ADR-039: Reservation Advisory Lock Oversell Protection

Status: Accepted

Reservation creation acquires deterministic PostgreSQL advisory transaction locks for each organization, stock location, and product variant allocation key.

After locking, the transaction recomputes on-hand and active reserved quantities before inserting the reservation. Concurrent reservations therefore cannot oversell the same stock slice.
