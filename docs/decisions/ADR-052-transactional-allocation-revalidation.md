# ADR-052: Transactional Allocation Revalidation

Status: Accepted

Allocate-and-reserve repeats all candidate and ATS checks inside the reservation transaction.

The workflow acquires advisory locks for each candidate location and requested variant, recomputes on-hand and active reserved quantities, and creates one active reservation only after the selected location is still sufficient.
