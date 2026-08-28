# SENVO POS Returns — Approved Frontend Handoff

## Scope

This handoff freezes the approved frontend treatment for the existing checkout-based POS return workflow.

The authoritative implementation is:

- `apps/admin/app/pos/checkouts/[id]/checkout-return-workspace.tsx`
- `apps/admin/app/pos/checkouts/[id]/checkout-return-workspace.module.css`

## Backend truth preserved

The UI reuses the existing return capability and does not create a parallel return system.

Read access requires:

- `POS:READ`
- `SALES:READ`
- `PAYMENT:READ`

Recording a return requires the existing permission set:

- `POS:UPDATE`
- `SALES:UPDATE`
- `INVENTORY:CREATE`
- `PAYMENT:APPROVE`

The UI also requires `INVENTORY:READ` to discover a valid destination Return hold location.

Receipt visibility remains permission-gated by the existing receipt/payment/sales read permissions.

## Supported workflow

1. Load the existing return account for a checkout.
2. Load stock locations and expose only locations that are:
   - active,
   - `RETURN_HOLD`,
   - non-sellable.
3. Select return quantities only from the server-provided returnable quantities.
4. Choose one of the existing reason codes:
   - Size or fit
   - Defective item
   - Wrong item
   - Changed mind
   - Other
5. Optionally add a note, maximum 500 characters.
6. Show a frontend credit preview.
7. Submit the return with the existing `createPosReturn` API and idempotency key.
8. Treat the server-calculated return credit as authoritative.
9. Show return receipt/history from existing append-only records.
10. If a return creates `refundableMinor`, clearly state that the refund has not been issued yet; refund execution belongs to the separate refund workflow.

## Safety behavior

- Over-return quantities are blocked in the UI and remain server-authoritative.
- A missing Return hold location blocks submission.
- Legacy sales without recorded payment history remain blocked from returns.
- Network/uncertain results preserve the same idempotency attempt and lock the submitted details so a retry can safely confirm the result.
- Definitive business/concurrency errors clear the attempt key and reload the latest return account before another edited attempt.
- Return history is treated as append-only operational history.

## Explicitly not implemented

The approved visual reference contained several decorative concepts that are not supported by the current return contract. They are not part of this implementation:

- global Returns dashboard/KPIs,
- approval / pending / rejected return states,
- exchange workflow,
- customer phone/customer search,
- invoice identifiers not present in the return account,
- generic return policy workflow,
- instant cash refund from the return form,
- direct restock into sellable inventory,
- fake pagination or global return search.

Refunds are intentionally a separate next frontend subflow.
