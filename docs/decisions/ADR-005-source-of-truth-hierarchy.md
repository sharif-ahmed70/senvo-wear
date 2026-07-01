# ADR-005: Source Of Truth Hierarchy

Date: 2026-07-01

## Status

Accepted

## Context

Bootstrap work can be distorted by stale prompts, assumptions, or undocumented expectations.

## Decision

Use this source-of-truth order: verified repository state, approved architecture or ADRs, task specification, then assumptions.

## Consequences

Future changes must inspect the repository first and preserve useful existing work.

## Alternatives Considered

Treating prompts as absolute was rejected because it risks destructive migrations over existing architecture.
