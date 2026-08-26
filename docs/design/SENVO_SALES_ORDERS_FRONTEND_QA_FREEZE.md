# SENVO Sales Orders Frontend QA Freeze

Status: frontend design handoff ready
Branch: `design/admin-ux-system`

## Scope reviewed

- `/sales/orders`
- `/sales/orders/[id]`
- list loading/error/access states
- detail loading/error/access states
- order state actions
- payment reconciliation/refund presentation
- responsive and print behavior

## Existing backend capability reused

The frontend intentionally reuses the existing Sales Orders APIs and does not introduce a second order workflow:

- list/search/filter orders
- get order details
- reserve order
- confirm order
- fulfill order
- cancel order
- read online payment details
- reconcile provider payment
- create provider refund

## UX rules frozen

- Order status appears once as the primary header state on details.
- List rows contain operational summary only; detail data is not duplicated into secondary cards.
- Totals remain with the item/order-money section.
- Inventory reservation/fulfillment data remains in its own section.
- Timeline contains historical state transitions only.
- No global KPI cards are shown on the list because the current list contract does not expose authoritative aggregate totals.
- No fake customer profile, cashier/actor, notes, edit-order, print-history, payment timestamp, or source metadata is invented.
- Cash on delivery is described as a payment preference, not as a confirmed paid/unpaid provider state.

## Safety and permissions

- `SALES_ORDER:READ` gates list/detail access.
- `SALES_ORDER:UPDATE` gates reserve/confirm/fulfill/cancel actions.
- destructive cancellation requires explicit confirmation in the redesigned detail page.
- actions submit the current `expectedVersion` to preserve concurrency protection.
- `PAYMENT:READ` gates provider payment detail.
- `PAYMENT:APPROVE` gates reconciliation/refund actions.
- provider refund keeps an idempotency key until the request succeeds.

## Real order lifecycle preserved

- `DRAFT` -> Reserve or Cancel
- `RESERVED` -> Confirm or Cancel
- `CONFIRMED` -> Fulfill
- terminal/current states expose no invented action

## Merge-agent instructions

1. Preserve the approved list/detail frontend structure unless a concrete integration conflict requires a small change.
2. Reuse the current Sales Orders domain/application/API behavior; do not rebuild order-state logic.
3. Keep route authorization server-derived once workforce auth is integrated.
4. Do not convert payment preference into a fabricated payment status.
5. Run Admin formatting, lint/typecheck/build and targeted Sales Orders tests before merge.
6. Resolve upstream workforce-auth changes separately; do not weaken permissions to make previews work.

## Remaining verification gate

This GitHub design environment has not executed the local Windows monorepo commands. Integration agent must run the real quality gates before production merge.
