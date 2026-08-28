# SENVO Booth History — Approved Frontend Handoff

## Purpose

Booth History is the operational screen for temporary event sales locations. It reuses the existing sales-booth backend capability; it does not create another sales-source system.

## Authoritative route

- `/sales/booths`
- `apps/admin/app/sales/booths/_components/booth-history-workspace.tsx`

The previous combined `sales-source-workspace.tsx` was retired after Sales Sources and Booth History received dedicated route components. Do not restore that combined implementation during merge.

## Real backend capabilities reused

- `AdminApiClient.listSalesBooths()`
- `AdminApiClient.createSalesBooth()`
- `AdminApiClient.updateSalesBoothStatus()`
- `SALES:READ`
- `SALES:CREATE`
- `SALES:UPDATE`
- version-based status update/concurrency semantics

## Frontend behavior

- List all real booth records.
- Search by booth name, location, or responsible staff.
- Filter by active/inactive status.
- Show booth name, location, event dates, responsible staff, status.
- Derive current/upcoming/past event label from the real date range only.
- Create a booth with name, location, start date, end date.
- Validate end date is not before start date.
- Activate/deactivate through an explicit confirmation dialog.
- Preserve inactive booth records in history.
- Export the currently filtered real booth records to CSV.
- Loading, empty, error, restricted and responsive states are included.

## Intentionally not implemented from visual exploration

The approved visual exploration contained decorative fields that are not present in the current booth contract/read model. They must not be fabricated:

- booth code
- orders today
- total orders per booth
- booth-sales analytics
- recent activity feed
- booth-type analytics
- invented source type per booth

If the backend later exposes authoritative booth performance data, hydrate the existing layout rather than creating a parallel booth dashboard.

## Non-repetition rule

- Booth status is shown once per row.
- Event date context is attached to the booth identity rather than repeated in summary cards.
- Summary strip contains only derived counts that help scanning: recorded, active, inactive.
- Historical explanation appears once below the table.

## Merge-agent instructions

1. Preserve this route/component as the authoritative Booth History frontend.
2. Do not recreate the retired combined Sales Source workspace.
3. Reuse existing sales-booth contracts and API client methods.
4. Do not add fake booth performance metrics.
5. Replace preview workforce/session composition only as part of the dedicated auth integration work.
6. Run targeted Admin typecheck/lint/build before merge.
