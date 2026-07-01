# ADR-010: Category Slug Scope

Date: 2026-07-01

## Status

Accepted

## Context

Categories are hierarchical, and future URLs or admin tools may reference categories by slug.

## Decision

Category slugs are unique within an organization, not only among siblings.

## Consequences

Category lookup is simpler and stable across hierarchy moves. Two sibling or distant categories cannot share a slug within the same organization.

## Alternatives Considered

Sibling-level slug uniqueness was considered, but it complicates lookup and future URL behavior.
