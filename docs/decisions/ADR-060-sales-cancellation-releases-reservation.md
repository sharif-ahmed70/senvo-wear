# ADR-060: Sales Cancellation Releases Reservation

Cancelling a reserved or confirmed order releases the active reservation in the same transaction.

Cancellation does not create an inventory movement because no stock has left inventory before fulfillment.
