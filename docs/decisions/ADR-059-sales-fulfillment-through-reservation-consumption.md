# ADR-059: Sales Fulfillment Through Reservation Consumption

Sales fulfillment consumes the linked inventory reservation and creates the posted issue movement from reservation lines.

The caller cannot submit movement lines. This keeps fulfillment quantities aligned with the protected reservation.
