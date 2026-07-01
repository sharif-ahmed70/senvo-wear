# ADR-013: Taxonomy Normalization Policy

Date: 2026-07-01

## Status

Accepted

## Context

Catalog identity needs predictable display names, codes, slugs, colors, sizes, and SKUs.

## Decision

Display names are trimmed, whitespace-collapsed, and casing-preserving. Codes and SKUs are trimmed, uppercased, and limited to letters, numbers, and hyphen. Slugs are lowercase and hyphen-separated. Color names store a normalized comparison form to prevent duplicates such as `Black`, `black`, and `BLACK`.

## Consequences

Data remains human-readable while uniqueness checks stay predictable. Unicode edge cases require care before adding multilingual catalog content.

## Alternatives Considered

Database collation-only uniqueness was rejected for this slice because behavior can vary by database configuration.
