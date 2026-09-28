import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";
import type {
  SupplierBalanceSummary,
  SupplierLedgerDirection,
  SupplierLedgerEntry,
  SupplierLedgerEntryType,
  SupplierPayment,
  SupplierPaymentMethod,
} from "./models.js";

export type CalculateSupplierBalanceInput = {
  totalAdjustedMinor?: bigint;
  totalBilledMinor: bigint;
  totalPaidMinor: bigint;
};

export type CalculateSupplierBalanceFromEntriesInput = {
  entries: readonly SupplierLedgerEntry[];
  initialBalanceMinor?: bigint;
  organizationId: string;
  supplierId: string;
};

/**
 * Calculates supplier balance using the formula:
 * outstanding = totalBilled - totalPaid - totalAdjusted
 *
 * Can be called with pre-aggregated totals or with an array of ledger entries.
 */
export function calculateSupplierBalance(
  params: CalculateSupplierBalanceInput,
): bigint;
export function calculateSupplierBalance(
  params: CalculateSupplierBalanceFromEntriesInput,
): SupplierBalanceSummary;
export function calculateSupplierBalance(
  params:
    CalculateSupplierBalanceInput | CalculateSupplierBalanceFromEntriesInput,
): bigint | SupplierBalanceSummary {
  if ("entries" in params) {
    return calculateSupplierBalanceFromEntries(params);
  }

  const { totalBilledMinor, totalPaidMinor, totalAdjustedMinor = 0n } = params;

  if (typeof totalBilledMinor !== "bigint" || totalBilledMinor < 0n) {
    throw new ValidationApplicationError(
      "Total billed amount must be a non-negative integer in minor units.",
      [{ field: "totalBilledMinor", reason: "Must be a non-negative BigInt" }],
    );
  }

  if (typeof totalPaidMinor !== "bigint" || totalPaidMinor < 0n) {
    throw new ValidationApplicationError(
      "Total paid amount must be a non-negative integer in minor units.",
      [{ field: "totalPaidMinor", reason: "Must be a non-negative BigInt" }],
    );
  }

  if (typeof totalAdjustedMinor !== "bigint") {
    throw new ValidationApplicationError(
      "Total adjusted amount must be a BigInt integer.",
      [{ field: "totalAdjustedMinor", reason: "Must be BigInt" }],
    );
  }

  return totalBilledMinor - totalPaidMinor - totalAdjustedMinor;
}

/**
 * Summarizes the supplier balance from ledger entries following standard accounts payable rules:
 * - BILL: increases liability (CREDIT) -> adds to totalBilledMinor
 * - PAYMENT: decreases liability (DEBIT) -> adds to totalPaidMinor
 * - RETURN_CREDIT: decreases liability (DEBIT) -> adds to totalAdjustedMinor
 * - OPENING_BALANCE: sets or increases liability (CREDIT -> billed/liability, DEBIT -> advance/paid)
 * - ADJUSTMENT: DEBIT decreases liability (adds to totalAdjustedMinor), CREDIT increases liability (subtracts from totalAdjustedMinor)
 *
 * Formula: outstandingBalanceMinor = totalBilledMinor - totalPaidMinor - totalAdjustedMinor
 */
export function calculateSupplierBalanceFromEntries(
  params: CalculateSupplierBalanceFromEntriesInput,
): SupplierBalanceSummary {
  const {
    entries,
    initialBalanceMinor = 0n,
    organizationId,
    supplierId,
  } = params;

  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new ValidationApplicationError("organizationId is required.", [
      { field: "organizationId", reason: "Cannot be empty" },
    ]);
  }

  if (
    !supplierId ||
    typeof supplierId !== "string" ||
    supplierId.trim().length === 0
  ) {
    throw new ValidationApplicationError("supplierId is required.", [
      { field: "supplierId", reason: "Cannot be empty" },
    ]);
  }

  if (typeof initialBalanceMinor !== "bigint") {
    throw new ValidationApplicationError(
      "initialBalanceMinor must be a BigInt.",
      [{ field: "initialBalanceMinor", reason: "Must be BigInt" }],
    );
  }

  let totalBilledMinor = 0n;
  let totalPaidMinor = 0n;
  let totalAdjustedMinor = 0n;
  let lastBillDate: Date | null = null;
  let lastPaymentDate: Date | null = null;

  if (initialBalanceMinor > 0n) {
    totalBilledMinor += initialBalanceMinor;
  } else if (initialBalanceMinor < 0n) {
    totalPaidMinor += -initialBalanceMinor;
  }

  for (const entry of entries) {
    if (entry.organizationId !== organizationId) {
      throw new BusinessRuleError(
        `Ledger entry organization mismatch: expected ${organizationId}, got ${entry.organizationId}.`,
      );
    }
    if (entry.supplierId !== supplierId) {
      throw new BusinessRuleError(
        `Ledger entry supplier mismatch: expected ${supplierId}, got ${entry.supplierId}.`,
      );
    }
    if (typeof entry.amountMinor !== "bigint" || entry.amountMinor <= 0n) {
      throw new BusinessRuleError(
        "Ledger entry amount must be greater than zero.",
      );
    }

    switch (entry.entryType) {
      case "BILL": {
        if (entry.direction !== "CREDIT") {
          throw new BusinessRuleError(
            "BILL entries must have CREDIT direction.",
          );
        }
        totalBilledMinor += entry.amountMinor;
        if (!lastBillDate || entry.entryDate > lastBillDate) {
          lastBillDate = entry.entryDate;
        }
        break;
      }
      case "PAYMENT": {
        if (entry.direction !== "DEBIT") {
          throw new BusinessRuleError(
            "PAYMENT entries must have DEBIT direction.",
          );
        }
        totalPaidMinor += entry.amountMinor;
        if (!lastPaymentDate || entry.entryDate > lastPaymentDate) {
          lastPaymentDate = entry.entryDate;
        }
        break;
      }
      case "RETURN_CREDIT": {
        if (entry.direction !== "DEBIT") {
          throw new BusinessRuleError(
            "RETURN_CREDIT entries must have DEBIT direction.",
          );
        }
        totalAdjustedMinor += entry.amountMinor;
        break;
      }
      case "OPENING_BALANCE": {
        if (entry.direction === "CREDIT") {
          totalBilledMinor += entry.amountMinor;
        } else if (entry.direction === "DEBIT") {
          totalPaidMinor += entry.amountMinor;
        } else {
          throw new BusinessRuleError("Invalid direction for OPENING_BALANCE.");
        }
        break;
      }
      case "ADJUSTMENT": {
        if (entry.direction === "DEBIT") {
          totalAdjustedMinor += entry.amountMinor;
        } else if (entry.direction === "CREDIT") {
          totalAdjustedMinor -= entry.amountMinor;
        } else {
          throw new BusinessRuleError("Invalid direction for ADJUSTMENT.");
        }
        break;
      }
      default: {
        const _exhaustive: never = entry.entryType;
        throw new BusinessRuleError(
          `Unknown ledger entry type: ${_exhaustive}`,
        );
      }
    }
  }

  const outstandingBalanceMinor =
    totalBilledMinor - totalPaidMinor - totalAdjustedMinor;

  return {
    lastBillDate,
    lastPaymentDate,
    organizationId,
    outstandingBalanceMinor,
    supplierId,
    totalAdjustedMinor,
    totalBilledMinor,
    totalPaidMinor,
  };
}

export type CreateSupplierLedgerEntryParams = {
  amountMinor: bigint;
  createdAt?: Date;
  currentBalanceMinor: bigint;
  direction?: SupplierLedgerDirection;
  entryDate?: Date;
  entryType: SupplierLedgerEntryType;
  id?: string;
  notes?: string | null;
  organizationId: string;
  referenceId?: string | null;
  referenceType?: string | null;
  supplierId: string;
};

/**
 * Creates a pure SupplierLedgerEntry with verified direction and calculated balanceAfterMinor.
 * Rules:
 * - BILL: increases liability (direction: CREDIT, balanceAfter = currentBalance + amount)
 * - PAYMENT: decreases liability (direction: DEBIT, balanceAfter = currentBalance - amount)
 * - RETURN_CREDIT: decreases liability (direction: DEBIT, balanceAfter = currentBalance - amount)
 * - OPENING_BALANCE: sets or increases liability (CREDIT -> currentBalance + amount, DEBIT -> currentBalance - amount)
 * - ADJUSTMENT: explicit direction required (CREDIT -> +amount, DEBIT -> -amount)
 */
export function createSupplierLedgerEntry(
  params: CreateSupplierLedgerEntryParams,
): SupplierLedgerEntry {
  const {
    amountMinor,
    currentBalanceMinor,
    entryType,
    organizationId,
    supplierId,
  } = params;

  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new ValidationApplicationError("organizationId is required.", [
      { field: "organizationId", reason: "Cannot be empty" },
    ]);
  }

  if (
    !supplierId ||
    typeof supplierId !== "string" ||
    supplierId.trim().length === 0
  ) {
    throw new ValidationApplicationError("supplierId is required.", [
      { field: "supplierId", reason: "Cannot be empty" },
    ]);
  }

  if (typeof amountMinor !== "bigint" || amountMinor <= 0n) {
    throw new ValidationApplicationError(
      "Ledger entry amount must be greater than zero.",
      [{ field: "amountMinor", reason: "Must be > 0" }],
    );
  }

  if (typeof currentBalanceMinor !== "bigint") {
    throw new ValidationApplicationError(
      "currentBalanceMinor must be a BigInt.",
      [{ field: "currentBalanceMinor", reason: "Must be BigInt" }],
    );
  }

  let direction: SupplierLedgerDirection;
  let balanceAfterMinor: bigint;

  switch (entryType) {
    case "BILL": {
      if (params.direction && params.direction !== "CREDIT") {
        throw new BusinessRuleError(
          "BILL entries must have CREDIT direction as they increase payable liability.",
        );
      }
      direction = "CREDIT";
      balanceAfterMinor = currentBalanceMinor + amountMinor;
      break;
    }
    case "PAYMENT": {
      if (params.direction && params.direction !== "DEBIT") {
        throw new BusinessRuleError(
          "PAYMENT entries must have DEBIT direction as they decrease payable liability.",
        );
      }
      direction = "DEBIT";
      balanceAfterMinor = currentBalanceMinor - amountMinor;
      break;
    }
    case "RETURN_CREDIT": {
      if (params.direction && params.direction !== "DEBIT") {
        throw new BusinessRuleError(
          "RETURN_CREDIT entries must have DEBIT direction as they decrease payable liability.",
        );
      }
      direction = "DEBIT";
      balanceAfterMinor = currentBalanceMinor - amountMinor;
      break;
    }
    case "OPENING_BALANCE": {
      direction = params.direction ?? "CREDIT";
      if (direction === "CREDIT") {
        balanceAfterMinor = currentBalanceMinor + amountMinor;
      } else if (direction === "DEBIT") {
        balanceAfterMinor = currentBalanceMinor - amountMinor;
      } else {
        throw new BusinessRuleError("Invalid direction for OPENING_BALANCE.");
      }
      break;
    }
    case "ADJUSTMENT": {
      if (!params.direction) {
        throw new BusinessRuleError(
          "ADJUSTMENT entries require an explicit direction (DEBIT or CREDIT).",
        );
      }
      direction = params.direction;
      if (direction === "CREDIT") {
        balanceAfterMinor = currentBalanceMinor + amountMinor;
      } else if (direction === "DEBIT") {
        balanceAfterMinor = currentBalanceMinor - amountMinor;
      } else {
        throw new BusinessRuleError("Invalid direction for ADJUSTMENT.");
      }
      break;
    }
    default: {
      const _exhaustive: never = entryType;
      throw new BusinessRuleError(`Unknown ledger entry type: ${_exhaustive}`);
    }
  }

  const now = new Date();
  const entryDate = params.entryDate ?? now;
  const createdAt = params.createdAt ?? now;
  const id = params.id ?? crypto.randomUUID();

  return {
    amountMinor,
    balanceAfterMinor,
    createdAt,
    direction,
    entryDate,
    entryType,
    id,
    notes: params.notes ?? null,
    organizationId: organizationId.trim(),
    referenceId: params.referenceId ?? null,
    referenceType: params.referenceType ?? null,
    supplierId: supplierId.trim(),
  };
}

export type CreateSupplierPaymentParams = {
  amountMinor: bigint;
  createdAt?: Date;
  id?: string;
  idempotencyKey?: string | null;
  notes?: string | null;
  organizationId: string;
  paymentDate?: Date;
  paymentMethod: SupplierPaymentMethod;
  purchaseId?: string | null;
  reference?: string | null;
  supplierId: string;
  updatedAt?: Date;
};

/**
 * Creates a pure SupplierPayment record with validation.
 */
export function createSupplierPayment(
  params: CreateSupplierPaymentParams,
): SupplierPayment {
  const { amountMinor, organizationId, paymentMethod, supplierId } = params;

  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new ValidationApplicationError("organizationId is required.", [
      { field: "organizationId", reason: "Cannot be empty" },
    ]);
  }

  if (
    !supplierId ||
    typeof supplierId !== "string" ||
    supplierId.trim().length === 0
  ) {
    throw new ValidationApplicationError("supplierId is required.", [
      { field: "supplierId", reason: "Cannot be empty" },
    ]);
  }

  if (typeof amountMinor !== "bigint" || amountMinor <= 0n) {
    throw new ValidationApplicationError(
      "Payment amount must be greater than zero.",
      [{ field: "amountMinor", reason: "Must be > 0" }],
    );
  }

  const validMethods: SupplierPaymentMethod[] = [
    "CASH",
    "BANK_TRANSFER",
    "CHEQUE",
    "MOBILE_BANKING",
  ];
  if (!validMethods.includes(paymentMethod)) {
    throw new ValidationApplicationError(
      `Invalid payment method: ${paymentMethod}`,
    );
  }

  const now = new Date();
  const paymentDate = params.paymentDate ?? now;
  const createdAt = params.createdAt ?? now;
  const updatedAt = params.updatedAt ?? now;
  const id = params.id ?? crypto.randomUUID();

  return {
    amountMinor,
    createdAt,
    id,
    idempotencyKey: params.idempotencyKey ?? null,
    notes: params.notes ?? null,
    organizationId: organizationId.trim(),
    paymentDate,
    paymentMethod,
    purchaseId: params.purchaseId ?? null,
    reference: params.reference ?? null,
    supplierId: supplierId.trim(),
    updatedAt,
  };
}
