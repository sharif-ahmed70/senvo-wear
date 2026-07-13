# ADR-078: Role Permission Mapping Strategy

## Status

Accepted

## Context

The identity foundation introduced roles but intentionally deferred the permission matrix. Authorization now needs default role behavior while remaining data-driven.

## Decision

Store role-to-permission assignments in `role_permissions` and keep an initial default mapping in domain code as data. `OWNER` receives all permissions, `ADMIN` receives management and operations permissions, `MANAGER` receives operations permissions, and `STAFF` receives read plus limited operational permissions.

## Consequences

The application can authorize immediately, and future policy administration can replace or supplement the default mapping with database-backed grants. This does not create custom roles or permission editing UI.
