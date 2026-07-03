# ADR-049: Single Location Allocation

Status: Accepted

Inventory allocation selects one stock location that can fulfill every requested line.

This keeps the reservation model aligned with the existing `stockLocationId` ownership on inventory reservations and avoids hidden split fulfillment semantics before sales-order orchestration exists.

If no one location can fulfill the request, allocation fails without creating a reservation.
