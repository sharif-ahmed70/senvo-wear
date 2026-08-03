# ADR-092: Business-Friendly Organization Management Boundary

## Status

Accepted

## Context

The organization, branch, identity, and authorization foundations use precise internal terms. SENVO Wear administrators are business owners and showroom managers who should not need to understand those implementation concepts.

At the same time, replacing domain terminology throughout the backend would duplicate mature rules and weaken existing organization isolation.

## Decision

Create a dedicated organization application service and API boundary that composes existing domain operations. Translate internal concepts only at the admin contract and presentation boundary:

- branch becomes Store;
- organization access record becomes Team member access;
- active capabilities become Access details.

The organization ID and actor identity always come from trusted execution context. Strict contracts reject context injection. Target status and target role remain validated business commands and do not grant authority to the caller.

Add profile metadata to the organization record and add `TEAM` as a distinct authorization resource. Keep store code uniqueness and team access uniqueness organization scoped.

## Consequences

- Admin wording remains approachable without changing established domain behavior.
- Backend authorization can distinguish business settings from team administration.
- Existing lifecycle and concurrency rules are reused.
- No password, login, payroll, or HR workflow is introduced.
- Store access is organization wide until a dedicated per-store assignment model is approved.
