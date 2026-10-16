# Storefront Reservation Expiry Normalization Runbook (Phase 2B)

> [!WARNING]
> **CRITICAL OPERATIONAL POLICY**
>
> **THIS COMMAND MUST NOT BE EXECUTED AGAINST PRODUCTION WITHOUT A SEPARATE REVIEWED DRY-RUN APPROVAL.**
>
> Production execution is strictly gated behind an explicit dry-run manifest inspection, verification of non-exposure to online payments or payment batches, and engineering approval.

---

## 1. Context & Purpose

Phase 2B provides a safe, tenant-scoped, idempotent operational command to discover and normalize legacy STOREFRONT sales orders where linked inventory reservations have `expiresAt IS NULL`.

### Key Behaviors:

- **Historical Expiry Calculation**: Expiry is derived strictly from `sales_orders.reservedAt` (+30 minutes for `ONLINE_PAYMENT`, +24 hours for `CASH_ON_DELIVERY`). Expiry is **never** granted fresh from current execution time (`now`).
- **Still-Valid Holds**: If the historical deadline is after the reference cutoff, `expiresAt` is persisted and the order/reservation remain `RESERVED` and `ACTIVE`. No inventory movements occur.
- **Overdue Holds**: If the historical deadline is before or at the reference cutoff, `expiresAt` is persisted and Phase 2A reservation reclaim is invoked **atomically within the same transaction**. The order transitions to `CANCELLED`, reservation to `EXPIRED`, and held stock is released with zero inventory movement.
- **Payment Exposure Guard**: Orders linked to ANY `OnlinePaymentAttempt` (in ANY status) or ANY `PaymentBatch` are **strictly deferred and never modified** by this command.

---

## 2. Preconditions

Before running this operational tool:

1. Verify that database migrations and application builds are up to date.
2. Obtain the target `organizationId` (UUID format).
3. Ensure no concurrent automated migrations or schema changes are in progress.
4. Establish a single UTC cutoff reference time for the run to ensure consistent evaluation.

---

## 3. Step 1 — Dry-Run Discovery (Default)

By default, the normalization tool executes in **DRY-RUN mode**. It performs zero database mutations and writes zero audit entries.

### Command Syntax:

```bash
pnpm --filter @senvo/application exec tsx src/cli/normalize-storefront-reservations.ts \
  --organization 22222222-2222-4222-8222-222222222222 \
  --batch-size 25 \
  --cutoff "2026-09-10T10:00:00.000Z" \
  --out /path/to/candidate-manifest.json
```

### Parameter Bounds:

- `--organization <uuid>`: Required. Enforces tenant isolation.
- `--batch-size <n>`: Keyset scan batch size. Default `25`, minimum `1`, maximum `100`.
- `--cutoff <ISO-8601>`: Optional reference time. Defaults to current clock time. Future timestamps are rejected.
- `--max-work <n>`: Optional upper limit on total candidates to scan.
- `--out <path>` or `--manifest <path>`: Path to save the candidate manifest JSON.

### Output Summary:

The dry-run outputs:

- Candidate counts by payment preference (`ONLINE_PAYMENT` vs `CASH_ON_DELIVERY`).
- Age distribution buckets (<1h, 1h-24h, 24h-7d, >7d).
- Classification into due (overdue) vs still-valid holds.
- Exclusions breakdown (`PAYMENT_EXPOSED`, `PAYMENT_BATCH_EXPOSED`, `NOT_STOREFRONT`, `INVALID_RESERVED_AT`, `INTEGRITY_MISMATCH`, etc.).

---

## 4. Step 2 — Manifest Review

The generated candidate manifest file contains strictly non-sensitive operational identifiers:

```json
{
  "organizationId": "22222222-2222-4222-8222-222222222222",
  "policyVersion": "phase-2b-v1",
  "cutoff": "2026-09-10T10:00:00.000Z",
  "generatedAt": "2026-09-10T10:00:05.123Z",
  "totalCandidates": 12,
  "candidates": [
    {
      "salesOrderId": "11111111-1111-4111-8111-111111111111",
      "reservationId": "33333333-3333-4333-8333-333333333333",
      "reservationNumber": "RES-00123",
      "organizationId": "22222222-2222-4222-8222-222222222222",
      "paymentPreference": "ONLINE_PAYMENT",
      "reservedAt": "2026-09-10T09:00:00.000Z",
      "calculatedExpiresAt": "2026-09-10T09:30:00.000Z",
      "dueClassification": "DUE",
      "baselineVersion": 1,
      "policyVersion": "phase-2b-v1",
      "runReferenceTime": "2026-09-10T10:00:00.000Z"
    }
  ]
}
```

### Review Checklist:

- [ ] Confirm no candidate has active payment gateway webhooks or customer transactions in flight.
- [ ] Confirm that all candidates belong to the intended organization.
- [ ] Verify that `dueClassification` aligns with expectations.
- [ ] Ensure that no unexpected candidate is approved.

---

## 5. Step 3 — Controlled Execution

Execution requires explicit approval and explicit flags.

### Execution Command:

```bash
pnpm --filter @senvo/application exec tsx src/cli/normalize-storefront-reservations.ts \
  --execute \
  --organization 22222222-2222-4222-8222-222222222222 \
  --manifest /path/to/approved-manifest.json \
  --out /path/to/execution-report.json
```

### Safety Protections During Execution:

1. **One Transaction Per Order**: Every order is isolated in its own database transaction. Failures on one row do not roll back previously committed rows.
2. **Deterministic Row Locking**: Locks `sales_orders` first, then `inventory_reservations`. Never introduces reverse lock edges.
3. **Pre-Mutation Revalidation**: Even if listed in the manifest, the current state of the database is re-checked under lock. If the reservation already has `expiresAt`, or order status changed, or payment evidence appeared, the row is safely skipped/deferred.
4. **Conditional Versioned Update**: Uses optimistic concurrency checks (`version = expectedVersion`) to prevent double-normalization.

---

## 6. Audit Trail & Rollback Semantics

### Generated Audit Actions:

- **`STOREFRONT_RESERVATION_EXPIRY_NORMALIZED`**:
  - Recorded for every normalized reservation.
  - Resource: `SALES_ORDER`
  - Metadata: `calculatedExpiresAt`, `previousExpiresAt: null`, `reservedAt`, `paymentPreference`, `policyVersion`, `versionTransition`.
- **`STOREFRONT_RESERVATION_EXPIRED`**:
  - Recorded additionally when an overdue hold is reclaimed.
  - Resource: `SALES_ORDER`

### Rollback Guarantees:

If any step within an order's transaction fails (e.g. database disconnect, audit write constraint failure):

- The entire transaction rolls back.
- `expiresAt` remains `NULL`.
- Order and reservation statuses remain unchanged.
- No audit entries are written.
- The failure is counted and reported in `failedCount`.

---

## 7. Post-Run Verification & Deferred Reconciliation

1. Review the generated execution report:
   - Check `committedCount` vs `skippedCount` vs `deferredCount` vs `failedCount`.
2. For any rows reported as `PAYMENT_EXPOSED` or `PAYMENT_BATCH_EXPOSED`:
   - Perform manual operations review to reconcile with payment gateway logs.
   - Do not attempt automatic cancellation of orders with payment records.
3. Note: Cancellations executed by this command are final; there is no automatic reversal.
