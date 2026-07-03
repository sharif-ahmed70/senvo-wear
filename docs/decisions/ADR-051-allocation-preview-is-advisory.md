# ADR-051: Allocation Preview Is Advisory

Status: Accepted

Allocation preview has no stock effect. It does not create a reservation, movement, or durable hold.

Preview may become stale immediately after it is returned. Final allocation must revalidate policy, eligibility, and ATS inside its transaction.
