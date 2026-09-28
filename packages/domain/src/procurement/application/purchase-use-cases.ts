import {
  BusinessRuleError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import {
  createInventoryMovement,
  postInventoryMovement,
} from "../../inventory/application/movement-use-cases.js";
import type {
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
} from "../../inventory/repositories/inventory-repositories.js";
import {
  deriveCostStateAfterReceipt,
  validatePurchaseLineData,
} from "../domain/costing-rules.js";
import { createSupplierLedgerEntry } from "../domain/supplier-ledger-rules.js";
import type { SupplierLedgerRepository } from "../repositories/supplier-payment-repository.js";
import type { Purchase, PurchaseWithLines } from "../domain/models.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type {
  PurchaseListFilter,
  PurchaseRepository,
} from "../repositories/purchase-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreatePurchaseDraftLineInput = {
  lineNumber: number;
  notes?: string | null;
  productName: string;
  productVariantId: string;
  quantity: number;
  sku: string;
  unitCostMinor: number;
  variantName?: string | null;
};

export type CreatePurchaseDraftInput = {
  destinationLocationId: string;
  expectedDeliveryDate?: Date | null;
  idempotencyKey?: string | null;
  lines: CreatePurchaseDraftLineInput[];
  notes?: string | null;
  organizationId: string;
  purchaseDate?: Date;
  purchaseNumber?: string;
  supplierId: string;
};

export async function createPurchaseDraftRecord(
  repository: PurchaseRepository,
  input: CreatePurchaseDraftInput,
): Promise<PurchaseWithLines> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const supplierId = assertEntityId(input.supplierId, "supplierId");
  const destinationLocationId = assertEntityId(
    input.destinationLocationId,
    "destinationLocationId",
  );

  if (input.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey(
      organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
  }

  if (!input.lines || input.lines.length === 0) {
    throw new ValidationApplicationError(
      "Purchase draft requires at least one line.",
      [{ field: "lines", reason: "At least one line is required" }],
    );
  }

  const seenVariants = new Set<string>();
  let totalCostMinor = 0n;

  const validatedLines = input.lines.map((line, index) => {
    const lineNumber = line.lineNumber ?? index + 1;
    validatePurchaseLineData({
      lineNumber,
      productName: line.productName,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      sku: line.sku,
      unitCostMinor: line.unitCostMinor,
    });

    if (seenVariants.has(line.productVariantId)) {
      throw new BusinessRuleError(
        "A product variant may appear only once per purchase order.",
        "DUPLICATE_VARIANT_IN_PURCHASE",
      );
    }
    seenVariants.add(line.productVariantId);

    const lineTotalCostMinor =
      BigInt(line.quantity) * BigInt(line.unitCostMinor);
    totalCostMinor += lineTotalCostMinor;

    return {
      lineNumber,
      notes: line.notes ?? null,
      productName: line.productName.trim(),
      productVariantId: line.productVariantId,
      quantity: line.quantity,
      sku: line.sku.trim(),
      totalCostMinor: lineTotalCostMinor,
      unitCostMinor: line.unitCostMinor,
      variantName: line.variantName?.trim() ?? null,
    };
  });

  const purchaseNumber =
    input.purchaseNumber?.trim() || generateDefaultPurchaseNumber();

  return repository.create({
    destinationLocationId,
    expectedDeliveryDate: input.expectedDeliveryDate ?? null,
    idempotencyKey: input.idempotencyKey?.trim() ?? null,
    lines: validatedLines,
    notes: input.notes?.trim() ?? null,
    organizationId,
    purchaseDate: input.purchaseDate ?? new Date(),
    purchaseNumber,
    status: "DRAFT",
    supplierId,
    totalCostMinor,
  });
}

export type GetPurchaseByIdInput = {
  organizationId: string;
  purchaseId: string;
};

export async function getPurchaseById(
  repository: PurchaseRepository,
  input: GetPurchaseByIdInput,
): Promise<PurchaseWithLines> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const purchaseId = assertEntityId(input.purchaseId, "purchaseId");

  const purchase = await repository.findById(purchaseId, organizationId);
  if (!purchase) {
    throw new NotFoundError("Purchase order was not found.");
  }

  return purchase;
}

export type ListPurchasesInput = PurchaseListFilter;

export async function listPurchaseRecords(
  repository: PurchaseRepository,
  input: ListPurchasesInput,
): Promise<Purchase[]> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  return repository.list({
    ...input,
    organizationId,
  });
}

export type ConfirmPurchaseOrderDependencies = {
  costRepository: CostRepository;
  inventoryMovementRepository: Pick<
    InventoryMovementRepository,
    "createDraft" | "findByIdempotencyKey"
  > &
    InventoryMovementPostingRepository;
  purchaseRepository: PurchaseRepository;
  supplierLedgerRepository?: SupplierLedgerRepository;
};

export type ConfirmPurchaseOrderInput = {
  idempotencyKey?: string | null;
  organizationId: string;
  purchaseId: string;
};

/**
 * Confirms a purchase order atomically:
 * 1. Validates DRAFT status and line presence.
 * 2. Creates and posts an inventory RECEIPT movement.
 * 3. Increases physical stock at the destination location.
 * 4. Recalculates moving weighted average cost using total physical on-hand quantity.
 * 5. Records an immutable InventoryCostEntry for each line.
 * 6. Upserts VariantCostState for each line.
 * 7. Transitions Purchase status to POSTED with receiptMovementId link.
 *
 * Idempotency:
 * - If purchase is already POSTED, returns it idempotently without re-posting.
 */
export async function confirmPurchaseOrder(
  dependencies: ConfirmPurchaseOrderDependencies,
  input: ConfirmPurchaseOrderInput,
): Promise<PurchaseWithLines> {
  const organizationId = assertEntityId(input.organizationId, "organizationId");
  const purchaseId = assertEntityId(input.purchaseId, "purchaseId");

  const purchase = await dependencies.purchaseRepository.findById(
    purchaseId,
    organizationId,
  );
  if (!purchase) {
    throw new NotFoundError("Purchase order was not found.");
  }

  // Idempotency: if already confirmed/posted, return existing record safely
  if (purchase.status === "POSTED") {
    return purchase;
  }

  if (purchase.status === "CANCELLED") {
    throw new BusinessRuleError(
      "A cancelled purchase order cannot be confirmed.",
      "PURCHASE_CANCELLED",
    );
  }

  if (!purchase.lines || purchase.lines.length === 0) {
    throw new BusinessRuleError(
      "Purchase order requires at least one line to be confirmed.",
      "PURCHASE_EMPTY_LINES",
    );
  }

  // 1. Create inventory receipt movement
  const movementIdempotencyKey = input.idempotencyKey
    ? `receipt:${input.idempotencyKey}`
    : `receipt:purchase:${purchase.id}`;

  const draftMovement = await createInventoryMovement(
    dependencies.inventoryMovementRepository,
    {
      destinationLocationId: purchase.destinationLocationId,
      idempotencyKey: movementIdempotencyKey,
      lines: purchase.lines.map((line) => ({
        note: line.notes ?? `Purchase ${purchase.purchaseNumber}`,
        productVariantId: line.productVariantId,
        quantity: line.quantity,
      })),
      movementNumber: `REC-${purchase.purchaseNumber}`,
      note: `Purchase receipt for ${purchase.purchaseNumber}`,
      occurredAt: new Date(),
      organizationId: purchase.organizationId,
      referenceId: purchase.id,
      referenceType: "PURCHASE",
      type: "RECEIPT",
    },
  );

  // 2. Post inventory receipt movement (stock increases at destination)
  const postedMovement = await postInventoryMovement(
    dependencies.inventoryMovementRepository,
    {
      movementId: draftMovement.id,
      organizationId: purchase.organizationId,
    },
  );

  // 3. For each line, update moving weighted average cost and record cost ledger entry
  for (const line of purchase.lines) {
    // Current on-hand quantity across organization after the movement posting
    const currentOnHand =
      await dependencies.costRepository.getVariantOnHandQuantity(
        purchase.organizationId,
        line.productVariantId,
      );

    // Physical on-hand quantity prior to this receipt
    const existingOnHandQuantity = Math.max(0, currentOnHand - line.quantity);

    // Current cost state
    const costState = await dependencies.costRepository.getCostState(
      purchase.organizationId,
      line.productVariantId,
    );

    // Derive new moving average cost and cost entry values
    const derived = deriveCostStateAfterReceipt({
      costState,
      existingOnHandQuantity,
      receivedQuantity: line.quantity,
      unitCostMinor: line.unitCostMinor,
    });

    // Record immutable audit ledger entry
    await dependencies.costRepository.recordCostEntry({
      afterAverageCostMinor: derived.afterAverageCostMinor,
      afterQuantity: derived.afterQuantity,
      afterValueMinor: derived.afterValueMinor,
      beforeAverageCostMinor: derived.beforeAverageCostMinor,
      beforeQuantity: derived.beforeQuantity,
      beforeValueMinor: derived.beforeValueMinor,
      eventType: "PURCHASE_RECEIPT",
      organizationId: purchase.organizationId,
      productVariantId: line.productVariantId,
      quantityChange: line.quantity,
      reference: purchase.purchaseNumber,
      sourceMovementId: postedMovement.id,
      sourcePurchaseId: purchase.id,
      valueChangeMinor: derived.valueChangeMinor,
    });

    // Upsert variant cost state
    await dependencies.costRepository.upsertCostState({
      averageCostMinor: derived.afterAverageCostMinor,
      costUnknownReason: derived.costUnknownReason,
      expectedVersion: costState?.version,
      inventoryValueMinor: derived.afterValueMinor,
      isCostKnown: derived.isCostKnown,
      lastCostEventAt: new Date(),
      organizationId: purchase.organizationId,
      productVariantId: line.productVariantId,
    });
  }

  // 4. Update purchase order to POSTED and link receipt movement
  await dependencies.purchaseRepository.update({
    id: purchase.id,
    organizationId: purchase.organizationId,
    receiptMovementId: postedMovement.id,
    status: "POSTED",
  });

  // 5. If supplier ledger repository is configured, record BILL entry
  if (dependencies.supplierLedgerRepository && purchase.totalCostMinor > 0n) {
    const currentBalance =
      await dependencies.supplierLedgerRepository.getSupplierBalance(
        purchase.supplierId,
        purchase.organizationId,
      );
    const ledgerEntry = createSupplierLedgerEntry({
      amountMinor: purchase.totalCostMinor,
      currentBalanceMinor: currentBalance?.outstandingBalanceMinor ?? 0n,
      entryDate: new Date(),
      entryType: "BILL",
      notes: `Bill for purchase ${purchase.purchaseNumber}`,
      organizationId: purchase.organizationId,
      referenceId: purchase.id,
      referenceType: "PURCHASE",
      supplierId: purchase.supplierId,
    });
    await dependencies.supplierLedgerRepository.recordLedgerEntry(ledgerEntry);
  }

  const updatedPurchase = await dependencies.purchaseRepository.findById(
    purchase.id,
    purchase.organizationId,
  );

  return (
    updatedPurchase ?? {
      ...purchase,
      receiptMovementId: postedMovement.id,
      status: "POSTED",
    }
  );
}

function generateDefaultPurchaseNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `PO-${timestamp}-${randomSuffix}`;
}

function assertEntityId(value: string, field: string): string {
  if (!uuidPattern.test(value)) {
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  }
  return value;
}
