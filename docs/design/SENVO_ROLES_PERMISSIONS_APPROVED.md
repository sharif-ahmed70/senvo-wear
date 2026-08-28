# SENVO Roles & Permissions — Approved Frontend Handoff

## Status

Frontend approved and implemented on `design/admin-ux-system`.

## Backend truth

- Access gate: `TEAM:READ`.
- Read API: `AdminApiClient.listRoles()` → `GET /organization/roles`.
- Contract: `RoleVisibilityContract`.
- Roles are the backend-provided fixed workforce roles (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`).
- Each role exposes `name`, `description`, `role`, and `permissions[]`.
- Each permission is a backend-provided `resource + action` pair.

## Implemented UI

- Premium read-only Roles & Permissions workspace.
- Role cards using real server role name/description.
- Real permission count per role.
- Selected-role details.
- Permissions grouped by backend resource with real actions.
- Refresh, loading, empty, permission-restricted, API-error, and responsive states.

## Explicitly not implemented

The current Admin API does not expose role or permission mutation operations. Do not add or infer:

- Create/custom role.
- Edit/delete/clone role.
- Active/system/custom role status or type.
- Permission checkboxes/toggles.
- Save permissions.
- User counts per role.
- Created/updated-by role metadata.
- Fake permission categories or permissions not present in `RoleVisibilityContract`.

If role-permission administration is added later, bind it to an explicit backend contract/API rather than extending this read-only screen speculatively.

## Consolidation

Organization, Store Locations, Team, and Roles now use dedicated workspaces. The previous combined `apps/admin/app/organization/_components/organization-workspace.tsx` was retired after the last route moved off it.
