# SENVO Team — Approved Frontend Handoff

## Authoritative route

- `/team`
- `apps/admin/app/team/_components/team-workspace.tsx`

## Backend/API truth used

The approved Team frontend reuses the existing Admin API only:

- `listTeam()`
- `createTeamMember()`
- `assignTeamMemberRole()`
- `updateTeamMemberStatus()`

Permissions:

- `TEAM:READ` — view team
- `TEAM:UPDATE` — add members, change role, activate/deactivate

## Supported Team fields

- Name
- Email
- Role
- Store access (read-only contract value)
- Status

Roles are limited to the existing role contract:

- `OWNER`
- `ADMIN`
- `MANAGER`
- `STAFF`

Role and status updates preserve `expectedVersion` concurrency protection.

## Add-member flow

The Team screen submits only:

- Name
- Email
- Role

It does **not** invent password/login setup. Workforce authentication remains a separate integration concern and existing backend capability.

## Deliberately excluded

Do not add these from design mockups unless a future backend audit proves support:

- phone number
- joined date
- last login
- created by
- profile/activity drawer
- reset password action
- invitation state
- salary/attendance/shift data
- sales performance
- custom sales/cashier roles
- store-assignment editor
- custom permission editor
- fake pagination

`storeAccess` is display-only in the current Team contract/API. There is no Team-screen store-assignment mutation in this approved frontend.

## Frontend behavior

- local search by Name/Email
- local Role filter
- local Active/Inactive filter
- real loaded-list Total/Active/Inactive counts
- refresh
- add member
- role-change confirmation
- activate/deactivate confirmation
- loading / empty / error / permission states
- responsive table/cards

## Integration note

`apps/admin/app/organization/_components/organization-workspace.tsx` is intentionally retained because the Roles route still uses its legacy `roles` view. Organization Profile, Store Locations and Team now have dedicated authoritative workspaces. Retire the combined Organization workspace only after the Roles redesign is complete and route usage is rechecked.
