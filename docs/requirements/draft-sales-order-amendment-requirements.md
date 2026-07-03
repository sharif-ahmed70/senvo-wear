# Draft Sales Order Amendment Requirements

## Scope

Implement pre-reservation amendment for draft sales orders only.

## Functional Requirements

- A draft order may update customer/contact snapshot fields.
- A draft order may update delivery-address snapshot fields.
- A draft order may update note, allocation policy, order discount, and delivery charge.
- A draft order may fully replace its lines with 1 to 500 lines.
- Line replacement must reject duplicate variants, invalid quantities, invalid money, archived variants, and cross-organization variants.
- Line replacement must refresh product name, SKU, color, and size snapshots from the current catalog.
- Totals must be recomputed by the server after metadata or line changes.
- Allocation policy assignment must use an active policy in the same organization, or `null` to clear.
- Amendments must preserve order number, channel, currency, idempotency key, payload signature, created timestamp, status, lifecycle linkage, and lifecycle timestamps.
- Amendments must require `expectedVersion` and increment version exactly once on success.

## Integrity Requirements

- Only `DRAFT` orders can be amended.
- No partial line replacement is allowed.
- Metadata, line replacement, total recomputation, and version increment must be atomic when combined.
- Stale amendments must fail with a concurrency error.
- Cross-organization order access must return not found.
- Failed amendments must leave existing lines and totals unchanged.

## Non-Goals

No payments, refunds, returns, customer accounts, promotions, tax, invoicing, authentication, HTTP endpoints, UI, POS, or amendment history are included.
