# ADR-015: Branch Code Uniqueness Scope

Date: 2026-07-02

## Status

Accepted

## Context

Branches need stable operational identifiers for humans, reports, stock flows, and future POS workflows.

## Decision

Branch codes are unique within an organization. Branch names may repeat and are treated as display labels.

## Consequences

Operational references stay unambiguous without requiring globally unique branch codes across all organizations.

## Alternatives Considered

Global branch-code uniqueness was rejected because organization isolation is the primary tenancy boundary. Name uniqueness was rejected because display names often change or repeat.
