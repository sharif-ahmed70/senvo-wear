# SENVO Checkout History — Approved Frontend Handoff

## Route

`/pos/checkouts`

Authoritative frontend:

- `apps/admin/app/pos/checkouts/_components/checkout-history-workspace.tsx`
- `apps/admin/app/pos/checkouts/_components/checkout-history-workspace.module.css`
- `apps/admin/app/pos/checkouts/page.tsx`

## Backend truth used

The page uses the existing `listPosCheckouts()` read contract. No new backend system is introduced.

Real list fields used:

- order number
- sales counter name
- staff/team member name
- checkout total
- paid amount
- outstanding amount
- payment status
- receipt presence
- completed timestamp

Real actions used:

- open checkout details
- collect outstanding payment when `PAYMENT:CREATE` is available and an amount is due
- view receipt when both `RECEIPT:READ` and `PAYMENT:READ` are available
- refresh the existing list
- export the currently loaded/filtered rows as a client-side CSV

## Search and filters

Search is intentionally local over the already-loaded checkout list and only covers:

- order number
- counter name
- staff/team member name

Filters are local:

- payment status
- due / clear balance

Customer phone/contact search is **not** implemented because the current POS checkout list contract does not expose customer contact fields.

## Explicitly not implemented

Do not infer these from design mockups or add them without a backend/contract audit:

- customer phone/name history lookup
- payment-method filtering on the checkout list
- server pagination or fake page counts
- fake checkout KPI cards / daily sales totals
- invoice numbers not present in the checkout contract
- inline item drawer populated from invented list data
- direct refund/audit-log shortcuts from the list unless supported by the relevant detail contract and permission path

## Existing legacy note

`apps/admin/app/pos/_components/pos-management-workspace.tsx` still contains the older Checkout History branch because the file also owns Sales Counters and Sales Sessions. The `/pos/checkouts` route no longer uses that checkout branch. Remove the now-unused checkout branch during the planned design-branch consolidation pass rather than risking a broad rewrite while Counters/Sessions are still pending redesign.

## Integration boundary

This remains frontend-first work. Preserve the existing POS domain/application/HTTP behavior. Later integration should bind real workforce authentication and run typecheck/lint/tests/build before merge.
