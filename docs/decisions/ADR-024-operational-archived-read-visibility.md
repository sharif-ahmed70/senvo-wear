# ADR-024: Operational Archived Read Visibility

## Status

Accepted

## Context

Archived operational records must remain inspectable for audit and historical context, but default operational browsing should not mix terminal records with active setup.

## Decision

List queries include `ACTIVE` and `INACTIVE` records by default and exclude `ARCHIVED`. Archived rows are returned only when the caller explicitly filters status to `ARCHIVED`. Get-by-id returns archived records when organization id and entity id match.

## Consequences

Default lists remain operationally useful, while archived records are still available through deliberate queries. No physical deletion is introduced.
