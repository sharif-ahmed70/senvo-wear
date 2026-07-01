# ADR-014: Catalog Referential Actions

Date: 2026-07-01

## Status

Accepted

## Context

Catalog records will later be referenced by inventory, orders, payments, returns, and reporting.

## Decision

Use restrictive delete behavior for catalog identity relations. Deactivation and archive statuses are preferred over casual physical deletion once references exist.

## Consequences

Accidental cascading deletion of business history is prevented. Explicit archive/deletion workflows can be designed later.

## Alternatives Considered

Cascading deletes were rejected because they can erase dependent business records unexpectedly.
