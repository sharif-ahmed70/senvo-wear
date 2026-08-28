# SENVO Organization Profile — Approved Frontend Handoff

## Route

`/organization`

## Authoritative frontend

- `apps/admin/app/organization/_components/organization-profile-workspace.tsx`
- `apps/admin/app/organization/_components/organization-profile-workspace.module.css`

## Backend truth

The page reuses the existing organization profile API only:

- `GET /organization`
- `PATCH /organization`

Permissions:

- `ORGANIZATION:READ` — view profile
- `ORGANIZATION:UPDATE` — edit/save profile

Editable fields are limited to the existing contract:

- Business name
- Country code
- Timezone
- Phone
- Email
- Address line 1
- Address line 2
- City
- District
- Postal code

Business code is read-only.

Updates preserve `expectedVersion` concurrency protection.

## Explicit non-features

Do not infer or implement from design mockups:

- legal business name
- TIN / VAT / BIN / registration number
- business type
- website
- currency setting
- logo/branding upload
- verified status
- account deactivate action
- subscription/billing
- created-by/updated-by metadata
- organization analytics
- store/team KPI cards

Store Locations, Team and Roles/Permissions remain separate modules and should not be duplicated on this page.

## Integration note

The older combined `organization-workspace.tsx` remains temporarily because other organization/team/settings routes may still depend on its Store, Team and Roles views. Retire or split it only after those dedicated modules are redesigned and route ownership is verified.
