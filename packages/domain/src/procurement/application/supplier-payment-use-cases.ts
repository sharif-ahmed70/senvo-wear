import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type {
  SupplierBalanceSummary,
  SupplierLedgerEntry,
  SupplierPayment,
  SupplierPaymentMethod,
} from "../domain/models.js";
import type {
  SupplierLedgerListFilter,
  SupplierLedgerRepository,
  SupplierPaymentListFilter,
  SupplierPaymentRepository,
} from "../repositories/supplier-payment-repository.js";
import type { SupplierRepository } from "../repositories/supplier-repository.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";
import { createSupplierLedgerEntry } from "../domain/supplier-ledger-rules.js";

export class SupplierPaymentIdempotencyConflictError extends ConflictError {
  constructor() {
    super(
      "This supplier payment idempotency key was already used with different details.",
    );
  }
}

export type RecordSupplierPaymentDependencies = {
  purchaseRepository?: PurchaseRepository;
  supplierLedgerRepository: SupplierLedgerRepository;
  supplierPaymentRepository: SupplierPaymentRepository;
  supplierRepository: SupplierRepository;
};

export type RecordSupplierPaymentInput = {
  amountMinor: bigint | number | string;
  idempotencyKey?: string | null;
  notes?: string | null;
  organizationId: string;
  paymentDate?: Date;
  paymentMethod: SupplierPaymentMethod;
  purchaseId?: string | null;
  reference?: string | null;
  supplierId: string;
};

export type RecordSupplierPaymentResult = {
  balance: SupplierBalanceSummary | null;
  payment: SupplierPayment;
};

export async function recordSupplierPayment(
  dependencies: RecordSupplierPaymentDependencies,
  input: RecordSupplierPaymentInput,
): Promise<RecordSupplierPaymentResult> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const supplierId = assertEntityId(input.supplierId, "supplierId");

  const supplier = await dependencies.supplierRepository.findById(
    supplierId,
    organizationId,
  );
  if (!supplier) {
    throw new NotFoundError("Supplier was not found in this organization.");
  }

  let purchaseId: string | undefined;
  if (input.purchaseId) {
    purchaseId = assertEntityId(input.purchaseId, "purchaseId");
    if (dependencies.purchaseRepository) {
      const purchase = await dependencies.purchaseRepository.findById(
        purchaseId,
        organizationId,
      );
      if (!purchase) {
        throw new NotFoundError(
          "Purchase order was not found in this organization.",
        );
      }
      if (purchase.supplierId !== supplierId) {
        throw new BusinessRuleError(
          "Purchase order belongs to a different supplier.",
          "PURCHASE_SUPPLIER_MISMATCH",
        );
      }
    }
  }

  let amountMinor: bigint;
  try {
    amountMinor = BigInt(input.amountMinor);
  } catch {
    throw new ValidationApplicationError(
      "amountMinor must be a valid integer representation.",
      [{ field: "amountMinor", reason: "Invalid BigInt format" }],
    );
  }

  if (amountMinor <= 0n) {
    throw new ValidationApplicationError(
      "Payment amount must be greater than zero.",
      [{ field: "amountMinor", reason: "Must be > 0" }],
    );
  }

  // Idempotency: a stored payment is only a replay of this request when it
  // records the same money movement. A key reused for a different supplier,
  // purchase, amount or method must never return (and attach) that payment.
  if (
    input.idempotencyKey &&
    dependencies.supplierPaymentRepository.findByIdempotencyKey
  ) {
    const existing =
      await dependencies.supplierPaymentRepository.findByIdempotencyKey(
        organizationId,
        input.idempotencyKey,
      );
    if (existing) {
      if (
        existing.supplierId !== supplierId ||
        (existing.purchaseId ?? null) !== (purchaseId ?? null) ||
        existing.amountMinor !== amountMinor ||
        existing.paymentMethod !== input.paymentMethod
      ) {
        throw new SupplierPaymentIdempotencyConflictError();
      }
      const currentBalance =
        await dependencies.supplierLedgerRepository.getSupplierBalance(
          supplierId,
          organizationId,
        );
      return { balance: currentBalance, payment: existing };
    }
  }

  const currentBalance =
    await dependencies.supplierLedgerRepository.getSupplierBalance(
      supplierId,
      organizationId,
    );

  const prevBalance = currentBalance?.outstandingBalanceMinor ?? 0n;
  const balanceAfterMinor = prevBalance - amountMinor;

  const payment = await dependencies.supplierPaymentRepository.recordPayment({
    amountMinor,
    idempotencyKey: input.idempotencyKey ?? null,
    notes: input.notes ?? null,
    organizationId,
    paymentDate: input.paymentDate ?? new Date(),
    paymentMethod: input.paymentMethod,
    purchaseId: purchaseId ?? null,
    reference: input.reference ?? null,
    supplierId,
  });

  await dependencies.supplierLedgerRepository.recordLedgerEntry({
    amountMinor,
    balanceAfterMinor,
    direction: "DEBIT",
    entryDate: payment.paymentDate,
    entryType: "PAYMENT",
    notes: input.notes ?? null,
    organizationId,
    referenceId: payment.id,
    referenceType: "SUPPLIER_PAYMENT",
    supplierId,
  });

  const updatedBalance =
    await dependencies.supplierLedgerRepository.getSupplierBalance(
      supplierId,
      organizationId,
    );

  return {
    balance: updatedBalance,
    payment,
  };
}

export type GetSupplierBalanceDependencies = {
  supplierLedgerRepository: SupplierLedgerRepository;
  supplierRepository: SupplierRepository;
};

export type GetSupplierBalanceInput = {
  organizationId: string;
  supplierId: string;
};

export async function getSupplierBalance(
  dependencies: GetSupplierBalanceDependencies,
  input: GetSupplierBalanceInput,
): Promise<SupplierBalanceSummary> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const supplierId = assertEntityId(input.supplierId, "supplierId");

  const supplier = await dependencies.supplierRepository.findById(
    supplierId,
    organizationId,
  );
  if (!supplier) {
    throw new NotFoundError("Supplier was not found in this organization.");
  }

  const balance =
    await dependencies.supplierLedgerRepository.getSupplierBalance(
      supplierId,
      organizationId,
    );

  if (!balance) {
    return {
      lastBillDate: null,
      lastPaymentDate: null,
      organizationId,
      outstandingBalanceMinor: 0n,
      supplierId,
      totalAdjustedMinor: 0n,
      totalBilledMinor: 0n,
      totalPaidMinor: 0n,
    };
  }

  return balance;
}

export type ListSupplierLedgerDependencies = {
  supplierLedgerRepository: SupplierLedgerRepository;
  supplierRepository: SupplierRepository;
};

export type ListSupplierLedgerInput = SupplierLedgerListFilter;

export async function listSupplierLedger(
  dependencies: ListSupplierLedgerDependencies,
  input: ListSupplierLedgerInput,
): Promise<SupplierLedgerEntry[]> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const supplierId = assertEntityId(input.supplierId, "supplierId");

  const supplier = await dependencies.supplierRepository.findById(
    supplierId,
    organizationId,
  );
  if (!supplier) {
    throw new NotFoundError("Supplier was not found in this organization.");
  }

  return dependencies.supplierLedgerRepository.listLedgerEntries({
    entryType: input.entryType,
    from: input.from,
    limit: input.limit,
    offset: input.offset,
    organizationId,
    supplierId,
    to: input.to,
  });
}

export type ListSupplierPaymentsInput = SupplierPaymentListFilter;

export async function listSupplierPayments(
  repository: SupplierPaymentRepository,
  input: ListSupplierPaymentsInput,
): Promise<SupplierPayment[]> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  return repository.listPayments({
    ...input,
    organizationId,
  });
}

export type RecordSupplierAdjustmentDependencies = {
  supplierLedgerRepository: SupplierLedgerRepository;
  supplierRepository: SupplierRepository;
};

export type RecordSupplierAdjustmentInput = {
  adjustmentDate?: Date;
  amountMinor: bigint | number | string;
  direction?: "DEBIT" | "CREDIT";
  entryType: "RETURN_CREDIT" | "ADJUSTMENT";
  idempotencyKey?: string | null;
  notes?: string | null;
  organizationId: string;
  purchaseId?: string | null;
  referenceId?: string | null;
  supplierId: string;
};

export type RecordSupplierAdjustmentResult = {
  balance: SupplierBalanceSummary | null;
  entry: SupplierLedgerEntry;
};

export async function recordSupplierAdjustment(
  dependencies: RecordSupplierAdjustmentDependencies,
  input: RecordSupplierAdjustmentInput,
): Promise<RecordSupplierAdjustmentResult> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const supplierId = assertEntityId(input.supplierId, "supplierId");

  const supplier = await dependencies.supplierRepository.findById(
    supplierId,
    organizationId,
  );
  if (!supplier) {
    throw new NotFoundError("Supplier was not found in this organization.");
  }

  let amountMinor: bigint;
  try {
    amountMinor = BigInt(input.amountMinor);
  } catch {
    throw new ValidationApplicationError(
      "amountMinor must be a valid integer representation.",
      [{ field: "amountMinor", reason: "Invalid BigInt format" }],
    );
  }

  if (amountMinor <= 0n) {
    throw new ValidationApplicationError(
      "Adjustment amount must be greater than zero.",
      [{ field: "amountMinor", reason: "Must be > 0" }],
    );
  }

  const currentBalance =
    await dependencies.supplierLedgerRepository.getSupplierBalance(
      supplierId,
      organizationId,
    );

  const direction = input.direction ?? "DEBIT";

  const ledgerEntry = createSupplierLedgerEntry({
    amountMinor,
    currentBalanceMinor: currentBalance?.outstandingBalanceMinor ?? 0n,
    direction,
    entryDate: input.adjustmentDate ?? new Date(),
    entryType: input.entryType,
    notes: input.notes,
    organizationId,
    referenceId: input.referenceId ?? input.purchaseId ?? null,
    referenceType: input.purchaseId
      ? "PURCHASE"
      : input.referenceId
        ? "ADJUSTMENT"
        : null,
    supplierId,
  });

  const createdEntry =
    await dependencies.supplierLedgerRepository.recordLedgerEntry(ledgerEntry);

  const updatedBalance =
    await dependencies.supplierLedgerRepository.getSupplierBalance(
      supplierId,
      organizationId,
    );

  return {
    balance: updatedBalance,
    entry: createdEntry,
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}
