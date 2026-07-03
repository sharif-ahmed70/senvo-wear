# ADR-041: Explicit Reservation Expiry Processing

Status: Accepted

Reservations may have `expiresAt`, but expiry is processed by an explicit command. This foundation does not add cron, queues, workers, or scheduler infrastructure.

The read model can identify active reservations that are past a supplied expiry cutoff.
