# SENVO Inventory — Approved UX & Integration Handoff

Status: **APPROVED**

## Product intent

Inventory answers three shop-floor questions without exposing database complexity:

1. What do we physically have?
2. What is already reserved?
3. What can we sell right now?

The UI must never allow direct stock overwrite. Stock changes happen through inventory movements so history, reservations and availability remain authoritative.

## Approved visual direction

- Premium SENVO warm-ivory workspace with charcoal navigation and restrained burgundy accents.
- Operational density where useful, but no generic AI-dashboard card spam.
- Real backend availability table is the primary source of truth.
- Scanner-first shortcuts for real shop operations.
- Clear loading, empty, error and permission states.
- Mobile/tablet responsive treatment for shop-floor use.

## Implemented on design/admin-ux-system

Main route: `/inventory`

The approved overview uses existing Admin API reads:

- `GET /inventory/availability`
- `GET /inventory/locations`
- `GET /inventory/movements`
- `GET /catalog/barcodes/lookup/:value`

Implemented behavior:

- Product/SKU search.
- Location filtering.
- Barcode scanner/manual lookup to identify a real variant and filter inventory.
- On-hand, reserved and available-to-sell summaries derived from loaded backend rows.
- Availability health derived only from exact backend quantities.
- Real recent movement history.
- Variant/location availability table.
- Links to movement history and stock-location views.
- Route loading/error states.
- Inventory read/update permission awareness.

## Truthfulness rules

The approved mockup showed concepts such as total inventory value, low-stock thresholds and trend analytics. The current backend read contract does not expose canonical valuation, threshold configuration or time-series aggregates. Production UI therefore MUST NOT invent these values.

The implementation replaces them with metrics that can be derived exactly from the returned availability records and visibly scopes results when the API indicates more rows exist.

## Stock-change integration gap

Current HTTP/API surface supports inventory reads and `POST /inventory/movements` for **posting an existing draft movement**. Its current input is a `movementId`. It does not expose a browser-facing operation for creating a new inventory movement draft.

Therefore Receive Stock, Transfer Stock and Stock Adjustment must not pretend to complete today. The approved overview explains this integration gate rather than mutating frontend-only quantities.

### Smallest backend follow-up

Expose a protected organization-scoped movement-creation operation that reuses the existing inventory application/domain rules and `createInventoryMovementInputSchema` semantics. Do not create a parallel stock system.

Required real-life mappings:

- Receive Stock -> movement type `RECEIPT`, destination location required, source external/null.
- Transfer Stock -> movement type `TRANSFER`, source and destination required and distinct.
- Positive adjustment -> `ADJUSTMENT_IN`.
- Negative adjustment -> `ADJUSTMENT_OUT`.
- Opening stock -> `OPENING` only where policy permits.

Each operation must continue to use idempotency keys, movement numbers, positive line quantities, organization scope and the immutable movement ledger.

After movement creation exists, Admin frontend can create the draft and then call the existing post operation. Cline should bind the prepared UX to those real endpoints rather than redesigning the workflow.

## Permission note

The backend post-movement handler requires `INVENTORY:UPDATE`. The Admin frontend permission union on the design branch was aligned to include this key. Workforce auth must ultimately derive this permission from the canonical membership/role permission model rather than the preview session.

## Explicit non-goals

- No direct `stock = X` overwrite.
- No fake stock success state.
- No fake valuation.
- No invented low-stock threshold.
- No client-side inventory authority.
- No duplicate inventory subsystem.
