# Sales Order Inventory Coordination

Sales order inventory effects are derived from the order and existing inventory boundaries.

## Reserve

Reservation starts from a `DRAFT` order with an allocation policy. The repository locks the order row, derives reservation lines from order lines, selects an eligible allocation location, locks stock keys with the shared inventory advisory-lock namespace, creates an active inventory reservation, links it to the order, and transitions the order to `RESERVED`.

The caller cannot provide reservation lines.

## Cancel

Cancelling a `DRAFT` order only changes order status. Cancelling a `RESERVED` or `CONFIRMED` order releases the linked active reservation in the same transaction and transitions the order to `CANCELLED`.

Cancellation never creates an inventory movement.

## Fulfill

Fulfillment starts from a `CONFIRMED` order with an active reservation. The repository locks the order and stock keys, derives movement lines from reservation lines, creates one posted `ISSUE` movement, marks the reservation consumed, links the movement to the order, and transitions the order to `FULFILLED`.

The caller cannot provide movement lines or quantities.
