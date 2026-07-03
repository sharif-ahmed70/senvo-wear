# Inventory Availability Model

Inventory availability combines two sources:

- on-hand quantity from posted inventory movements
- reserved quantity from active inventory reservations

The availability query returns `organizationId`, `stockLocationId`, `productVariantId`, `onHandQuantity`, `reservedQuantity`, and `availableQuantity`.

Availability is always scoped by organization and stock location. List pagination is ordered by `productVariantId` ascending and uses cursor pagination with `pageSize + 1`.

Reservation creation uses deterministic advisory locks for each `organizationId + stockLocationId + productVariantId` key, then recomputes on-hand and active reserved quantities inside the transaction before inserting the reservation.
