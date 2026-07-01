# ADR-004: Online-First POS

Date: 2026-07-01

## Status

Accepted

## Context

The showroom POS will eventually interact with inventory, sales, returns, customer, and payment capabilities.

## Decision

Treat POS as online-first in this foundation. Full offline transaction support is not part of the bootstrap.

## Consequences

The POS can share server-side consistency guarantees with the rest of the business system. Offline conflict resolution remains a future decision.

## Alternatives Considered

Full offline-first POS was rejected for the foundation because it would introduce synchronization and conflict-resolution complexity prematurely.
