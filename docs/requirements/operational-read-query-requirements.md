# Operational Read Query Requirements

This slice adds read/list application queries only for Branch, Stock Location, and POS Counter.

Non-goals:

- inventory balances
- stock ledger or movement
- transfers or reservations
- POS sales or cashier shifts
- users, authentication, permissions, or roles
- HTTP routes, GraphQL, or UI
- caching, reporting dashboards, or total-count analytics

Required behavior:

- get queries require `organizationId` and entity id
- list queries require `organizationId`
- cross-organization gets return not found
- cross-organization records never appear in lists
- outputs include lifecycle status and version
- archived records are excluded from lists by default
- archived records are included only with explicit archived status filter
- get-by-id returns archived records when organization and id match
- page size defaults to 25 and is capped at 100
- cursors must be validated before repository access
- search is trimmed, blank-safe, and limited to name/code

Supported filters:

- Branch: status, type, search
- Stock Location: branchId, status, type, isSellable, search
- POS Counter: branchId, status, search

No generic query framework or Prisma where-clause exposure is allowed.
