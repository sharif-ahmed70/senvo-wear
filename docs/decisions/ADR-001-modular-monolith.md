# ADR-001: Modular Monolith

Date: 2026-07-01

## Status

Accepted

## Context

SENVO Wear will span several business capabilities, but the project is early and does not need distributed-system complexity.

## Decision

Use a modular monolith with explicit package and module boundaries.

## Consequences

The team can move quickly while preserving future separation of concerns. Boundary discipline must be maintained through exports, documentation, and review.

## Alternatives Considered

Microservices were rejected because deployment and operational complexity would arrive before the business model is proven.
