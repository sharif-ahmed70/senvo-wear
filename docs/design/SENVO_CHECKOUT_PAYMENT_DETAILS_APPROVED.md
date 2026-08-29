# SENVO Checkout Payment Details — Approved Frontend Handoff

## Scope

This handoff covers the existing POS checkout payment account and later-payment collection flow at `/pos/checkouts/[id]`.

The payment workspace must remain aligned to the current backend contracts and API behavior. Returns and refunds are separate subflows and are not redesigned by this handoff.

## Backend capabilities used

- Read checkout details with `getPosCheckout(checkoutId)`.
- Read the authoritative payment account with `getPosPaymentAccount(checkoutId)`.
- Collect a later payment with `collectPosPayment(...)`.
- Payment methods are limited to the current contract values:
  - Cash
  - Card
  - Mobile banking
  - Bank transfer
- Non-cash payment lines require a transaction reference.
- A collection cannot exceed the current outstanding amount.
- Multiple payment lines are supported up to the existing UI/backend limit.
- Collection uses the existing idempotency key behavior. When the result is uncertain after a network failure, the same attempt details remain locked for safe retry.
- Legacy checkouts without recorded payment history cannot accept later collections.
- A checkout with zero outstanding balance is read-only and shown as paid in full.
- Payment-collection receipts and original sales receipts remain permission-gated.

## Approved information hierarchy

1. Checkout identity
   - Order number
   - Sales counter
   - Team member
   - Completed date/time
2. Payment balance
   - Order total
   - Amount paid
   - Amount due
3. Original payment lines
4. Later collection history
   - Collected time
   - Team member
   - Amount
   - Balance after
   - Receipt link when permitted
5. Outstanding-payment collection panel when the role and balance allow it
6. Safe success, validation, legacy, paid-in-full, permission and uncertain-result states

## Explicitly not implemented from visual concepts

Do not infer or add these without a verified backend contract:

- Invoice number
- Checkout item table inside this payment workspace
- Tax/charge breakdown
- Order timeline
- Customer phone/name lookup
- Refund or return action inside the payment workspace
- Audit log action
- Download-receipt feature
- Arbitrary payment methods
- Overpayment/change handling

Returns and refunds remain separate existing workspaces and will receive their own approved frontend pass.

## Permission truth

- Payment details require `POS:READ` and `PAYMENT:READ`.
- Later collection additionally requires `PAYMENT:CREATE`.
- Receipt links require `RECEIPT:READ` and `PAYMENT:READ` and a real receipt identifier.

## Integration note

Do not replace the current payment-account model with client-calculated payment truth. The backend payment account remains authoritative for cumulative paid amount, outstanding amount, collection history and concurrency/business-rule checks.
