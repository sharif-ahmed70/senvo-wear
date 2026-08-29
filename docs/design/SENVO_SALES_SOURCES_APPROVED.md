# SENVO Sales Sources — Approved Frontend Handoff

## Status

Approved visual direction and frontend implementation are ready on `design/admin-ux-system`.

## Route

- `/sales/channels`

## Source of truth

Reuse the existing `AdminApiClient.getSalesSourceSummary()` read model.

The current supported summary data is intentionally limited to backend-owned sales-channel attribution:

- `ONLINE`
- `OFFLINE_STORE`
- `EVENT_BOOTH`
- `orderCount`
- `totalMinor`
- `legacyOrderCount`

## Implemented UX

- premium SENVO Sales Sources overview
- tracked-order total derived from current supported summary channels
- tracked-sales total derived from current supported summary channels
- legacy-labeled order count only when present
- Online / Store / Event Booth comparison
- order-share visualization derived from real order counts
- real sales totals
- refresh
- Sales Orders navigation
- Booth History navigation
- loading, API error and permission-restricted states
- responsive layout

## Deliberately NOT implemented

Do not infer these capabilities from the approved visual reference image:

- custom `New Sales Source` creation
- arbitrary Website / Mobile App / Facebook / Instagram / Phone Order source records
- source active/inactive management
- source default-payment configuration
- `Orders Today`
- source-created timestamps
- source pagination/search as if sources were persisted configurable entities

The current backend does not expose those as Sales Source management records. Adding them now would create fake UI or duplicate/invent backend capability.

## Related existing module

`/sales/booths` is separate and already owns real Event Booth management functionality (list/create/status change). Do not duplicate booth creation or lifecycle management inside Sales Sources.

## UX rule

One data point should have one primary home. The Sales Sources page shows attribution and comparison. Sales Orders owns order processing. Booth History owns booth management.

## Merge-agent instruction

Preserve this approved frontend and the existing sales backend. Do not rebuild sales-channel domain logic. Run the normal Admin lint/typecheck/build verification when integrating into the feature branch.
