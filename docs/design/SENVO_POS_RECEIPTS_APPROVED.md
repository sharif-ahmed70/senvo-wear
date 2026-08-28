# SENVO POS Receipts — Approved Frontend Handoff

## Scope

This checkpoint finalizes the shared premium printable presentation for the existing POS receipt contracts.

Covered receipt types:

- Sales receipt
- Later-payment collection receipt
- Return receipt
- Refund receipt

All four use the shared authoritative style module:

`apps/admin/app/pos/_components/receipt-document.module.css`

## Backend truth preserved

### Sales receipt

Uses the existing `SalesReceiptContract` and `getPosReceipt(checkoutId)` API.

Supported content includes:

- organization identity/address/contact when present
- receipt number
- order number
- issued time
- sales source
- counter name/code
- team member
- payment status
- item snapshots, SKU/color/size, quantity, unit price and line total
- subtotal/discount/delivery/total
- paid/outstanding
- recorded payment lines and references

### Later-payment receipt

Uses `PaymentCollectionReceiptContract` and `getPaymentCollectionReceipt(collectionId)`.

Supported content includes:

- organization identity/address/contact when present
- receipt/order number
- collection time
- accepted-by team member
- paid/partially-paid status
- actual collection payment methods/references
- order total
- this collection amount
- cumulative paid
- outstanding amount

### Return receipt

Uses `PosReturnReceiptContract` and `getPosReturnReceipt(returnId)`.

Returned stock remains tied to the recorded Return Hold destination and the receipt reflects the server-calculated return credit/account values.

### Refund receipt

Uses `PaymentRefundReceiptContract` and `getPosRefundReceipt(refundId)`.

POS external/card/mobile/bank refunds are recorded only after money was actually returned outside SENVO. The receipt must not imply that this POS screen executed a provider refund.

## Permission rules

Sales and payment-collection receipt access requires:

- `RECEIPT:READ`
- `PAYMENT:READ`

Return/refund receipts additionally require:

- `SALES:READ`

Do not weaken these gates during integration.

## Print behavior

- Browser print is the supported action.
- Sales, payment-collection, return and refund receipt components support print-friendly rendering.
- Sales and payment-collection routes support `?print=1` auto-print behavior; return/refund routes already supported it.
- Print CSS hides the screen toolbar and removes decorative screen-only chrome.

## Explicitly unsupported / intentionally excluded

Do not implement from mockups without a real contract/API:

- Download PDF
- Send by email/SMS
- Share link
- receipt barcode/QR
- customer CRM/contact fields not present in the receipt contract
- loyalty points
- invented VAT/tax values
- fake return policy text
- fake payment-account status
- duplicate receipt analytics/dashboard cards

## Integration rule

Current backend/read contracts are authoritative. If a future backend adds a new receipt field or delivery channel, bind it explicitly rather than deriving or fabricating receipt data in the frontend.
