# SENVO POS Refunds — Approved Frontend Handoff

Status: frontend-approved and backend-truth aligned.

## Authoritative scope

This screen is the checkout-level POS money-refund workflow. It reuses the existing refund account and refund creation APIs; it does not introduce a refund-request system.

Real flow:

1. Read the checkout refund account.
2. Show gross received, cumulative refunded, net received and refundable amount.
3. Record one or more refund method lines using the existing payment method contract: CASH, CARD, MOBILE_BANKING, BANK_TRANSFER.
4. Require a transaction reference for every non-cash line.
5. Never allow the recorded amount to exceed the current refundable amount.
6. Require explicit confirmation that the money was already returned to the customer.
7. POST the refund with the existing idempotency key flow.
8. Show the resulting refund receipt and append-only refund history.

## Important operational meaning

The POS refund screen records money that has already been returned.

- Cash: the cashier hands the cash to the customer, then confirms and records it.
- Card / Mobile Banking / Bank Transfer: the refund is issued outside this POS screen, then SENVO records the completed money movement with its reference.
- This UI must not imply that SENVO's POS screen itself sends an external-provider refund.
- Provider-native online-payment refund/reconciliation is a separate backend flow and must remain separate.

## Permissions

Read:
- POS:READ
- SALES:READ
- PAYMENT:READ

Create/record refund:
- PAYMENT:CREATE
- PAYMENT:APPROVE
- plus the read permissions above

Refund receipt visibility:
- RECEIPT:READ
- PAYMENT:READ
- SALES:READ

## Safety states preserved

- Legacy checkout without detailed payment history blocks refund tracking.
- Over-refund is blocked.
- Non-cash reference is required.
- Split refund remains supported up to the existing eight-line frontend/domain limit.
- Confirmation resets when editable refund details change.
- Network/unknown result locks the draft and reuses the same idempotent attempt for a safe retry.
- Business-rule/concurrency failure refreshes the authoritative refund account before another attempt.
- Null legacy financial fields display as `Not recorded`, not a fabricated zero.

## Deliberately not implemented

The approved visual exploration contained concepts that are not part of the current POS refund backend. They are not implementation requirements:

- global refund KPI dashboard
- Approved / Pending / Rejected workflow
- refund requests or approval queue
- customer name/phone search
- return ID joins not present in this read model
- refund timeline/request status
- `Mark as Paid`
- fake pagination or global refund list
- store credit
- provider-success simulation

## Authoritative files

- `apps/admin/app/pos/checkouts/[id]/checkout-refund-workspace.tsx`
- `apps/admin/app/pos/checkouts/[id]/checkout-refund-workspace.module.css`

The current server contracts and application/domain behavior remain authoritative if this handoff ever conflicts with backend truth.
