# ADR-076: Role Foundation Without Permission Matrix

## Status

Accepted

## Decision

Introduce the initial roles `OWNER`, `ADMIN`, `MANAGER`, and `STAFF`, plus an extensible permission type, without enforcing a detailed permission matrix yet.

## Rationale

Roles are needed now to carry organization access context and establish stable contracts. Detailed capability mapping should wait until authenticated workflows and administrative screens are designed.

## Consequences

Memberships can carry role immediately. Future work can map roles to permissions without replacing the membership model. Current domain access validation only checks user and membership activity, not fine-grained permissions.
