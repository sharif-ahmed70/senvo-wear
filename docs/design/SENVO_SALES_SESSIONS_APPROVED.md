# SENVO Sales Sessions — Approved Frontend Handoff

Status: frontend approved and implemented on `design/admin-ux-system`.

## Authoritative route

- `apps/admin/app/pos/sessions/page.tsx`
- `apps/admin/app/pos/sessions/_components/sales-sessions-workspace.tsx`

## Real backend/API capability used

- `listSalesSessions()`
- `listSalesCounters()`
- `openSalesSession({ counterId })`
- `closeSalesSession({ sessionId, expectedVersion })`

Permissions:

- `POS:READ` — view sessions
- `POS:CREATE` — open a session
- `POS:UPDATE` — close an open session

## UX truth

A counter can be selected for a new session only when it is ACTIVE and does not already have an OPEN session.

Session history uses only fields available in the current contract:

- counter identity resolved from the loaded counter list
- opened time
- closed time
- OPEN / CLOSED status
- version-backed close action

The frontend also provides local counter name/code search, local OPEN/CLOSED filtering, refresh, permission states, loading/error/empty states, and responsive layout.

The compact counts for open, closed, and currently available counters are derived only from the loaded real lists. They are not backend KPIs.

## Do not invent during integration

The approved mockup contained decorative concepts that are NOT part of the current Sales Session contract. Do not add them unless backend capability is deliberately introduced later:

- session sales totals
- order counts
- received / due totals
- payment-method summary
- collection rate
- assigned cashier/team-member field on the session
- opening cash / closing cash
- shift notes
- session reports
- fake server pagination
- global session analytics

## Legacy note

`apps/admin/app/pos/_components/pos-management-workspace.tsx` still contains the older Sessions implementation because the same combined component is still used by Sales Counters. The `/pos/sessions` route no longer uses that legacy Sessions block.

Do not perform a broad deletion during an unrelated merge. Once Sales Counters receives its dedicated approved workspace, the combined POS management component can be consolidated/retired in the planned cleanup pass.

## Integration rule

Preserve existing domain/application behavior. Do not create a parallel session backend. Current source/backend truth wins over decorative design assumptions.
