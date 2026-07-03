# Consume Inventory Reservation

Use `consumeInventoryReservation(repository, input)` to issue stock reserved by one active reservation.

Input:

- `organizationId`
- `reservationId`
- `expectedReservationVersion`
- `movementNumber`
- `idempotencyKey`
- `occurredAt`
- optional `referenceType` and `referenceId`
- optional `note`

The server derives:

- `type = ISSUE`
- `sourceLocationId = reservation.stockLocationId`
- `destinationLocationId = null`
- movement lines from reservation lines

Availability effect example:

```text
Before: onHand 10, activeReserved 4, ATS 6
After:  onHand  6, activeReserved 0, ATS 6
```

If the generated consumption movement is later reversed, on-hand increases and ATS increases. The reservation remains `CONFIRMED`; reversal is an inventory correction, not demand reactivation.
