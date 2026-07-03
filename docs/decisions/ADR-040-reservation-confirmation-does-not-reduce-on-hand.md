# ADR-040: Reservation Confirmation Does Not Reduce On-Hand

Status: Accepted

Confirmed means the hold has been consumed by a future workflow. In this foundation, confirmation releases the active reservation from ATS calculation but does not create an `ISSUE` movement.

A later sales or order workflow must post the outbound movement and confirm the reservation atomically.
