# ADR-077: Permission Resource Action Model

## Status

Accepted

## Context

SENVO Wear needs a fine-grained authorization foundation without coupling policy to authentication transport or UI concerns.

## Decision

Represent each permission as a unique `(resource, action)` pair. Resources cover organization, user, catalog, inventory, reservation, sales order, and report capabilities. Actions cover create, read, update, delete, approve, cancel, and fulfill.

## Consequences

The model is simple to validate, easy to persist, and can grow into a richer policy system later. It does not yet encode field-level or condition-based authorization.
