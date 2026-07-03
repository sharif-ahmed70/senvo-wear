# ADR-062: Terminal Sales Order Lifecycle

`CANCELLED` and `FULFILLED` are terminal sales order states.

Terminal-state protection prevents accidental duplicate cancellation, duplicate fulfillment, and history rewrites.
