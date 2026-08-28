# SENVO Store Locations — Approved Frontend Handoff

## Authoritative scope

The Store Locations frontend is implemented against the existing organization store contracts and API client only.

### Real data shown
- Store name
- Store code
- Address
- City
- Phone
- ACTIVE / INACTIVE status

### Real actions
- `ORGANIZATION:READ` — list stores
- `ORGANIZATION:UPDATE` — add store
- `ORGANIZATION:UPDATE` — edit store details
- `ORGANIZATION:UPDATE` — activate / deactivate store
- Refresh loaded store data

### Create fields
- Name
- Code
- Address
- City
- Phone

### Edit fields
- Name
- Address
- City
- Phone

Store code is immutable in the edit UI.

### Safety
- Store update and status changes preserve `expectedVersion` concurrency semantics.
- Activate/deactivate requires explicit confirmation.
- Search and status filtering operate locally on the loaded real store list.
- Total / Active / Inactive counts are derived from the loaded list.

## Explicitly not implemented
Do not infer or add these from design mockups without backend support:
- Event booths inside Store Locations
- Main/default store flags
- Sales, revenue, inventory, staff, or counter metrics
- Open-session details
- Manager assignment
- Opening hours
- Map coordinates
- Created-by / updated-by metadata
- Fake pagination
- CSV export
- Location type filters

Event booths remain in Booth History / Sales Sources. Sales counters and sessions remain in their dedicated POS modules.

## Integration note
`/store-locations` now uses the dedicated `StoreLocationsWorkspace`. The older combined `OrganizationWorkspace` must remain temporarily because Team and Roles still use its legacy views until those modules receive their dedicated redesigns.
