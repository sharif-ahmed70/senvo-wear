import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import {
  createInventoryMovement,
  postInventoryMovement,
} from "../../inventory/application/movement-use-cases.js";
import type { InventoryMovementRepository } from "../../inventory/repositories/inventory-repositories.js";
import { calculateCheckoutSettlement } from "../../payment/application/payment-rules.js";
import type { PosReturnReceiptRepository } from "../../receipt/repositories/receipt-repository.js";
import type {
  PosReturnAccount,
  PosReturnReceipt,
  PosReturnReasonCode,
  PosSaleReturn,
} from "../domain/return-models.js";
import type { PosReturnRepository } from "../repositories/pos-return-repository.js";

const reasons = [
  "CHANGED_MIND",
  "DEFECTIVE",
  "OTHER",
  "SIZE_OR_FIT",
  "WRONG_ITEM",
] as const satisfies readonly PosReturnReasonCode[];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ReturnMovementRepository = Pick<
  InventoryMovementRepository,
  "createDraft" | "findById" | "findByIdempotencyKey" | "post"
>;

export async function getPosReturnAccount(
  repository: PosReturnRepository,
  input: { checkoutId: string; organizationId: string },
): Promise<PosReturnAccount> {
  const account = await repository.findAccount(
    assertId(input.checkoutId, "checkoutId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!account) throw new NotFoundError("Checkout was not found.");
  return account;
}

export async function getPosReturnReceipt(
  repository: PosReturnReceiptRepository,
  input: { organizationId: string; returnId: string },
): Promise<PosReturnReceipt> {
  const receipt = await repository.findPosReturnReceiptById(
    assertId(input.returnId, "returnId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!receipt) throw new NotFoundError("Return receipt was not found.");
  return receipt;
}

export async function recordPosSaleReturn(
  repositories: {
    inventory: ReturnMovementRepository;
    receipts: PosReturnReceiptRepository;
    returns: PosReturnRepository;
  },
  input: {
    acceptedByUserId: string;
    checkoutId: string;
    destinationLocationId: string;
    idempotencyKey: string;
    lines: readonly { quantity: number; salesOrderLineId: string }[];
    organizationId: string;
    reasonCode: PosReturnReasonCode;
    reasonNote?: string | null;
    receiptId: string;
    returnId: string;
    returnedAt: Date;
  },
): Promise<{
  account: PosReturnAccount;
  replayed: boolean;
  saleReturn: PosSaleReturn;
}> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const acceptedByUserId = assertId(input.acceptedByUserId, "acceptedByUserId");
  const destinationLocationId = assertId(
    input.destinationLocationId,
    "destinationLocationId",
  );
  const returnId = assertId(input.returnId, "returnId");
  const receiptId = assertId(input.receiptId, "receiptId");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const reasonCode = normalizeReason(input.reasonCode);
  const reasonNote = normalizeReasonNote(input.reasonNote);
  const lines = normalizeReturnLines(input.lines);
  const requestSignature = JSON.stringify({
    destinationLocationId,
    lines,
    reasonCode,
    reasonNote,
  });
  const preparation = await repositories.returns.prepare({
    acceptedByUserId,
    checkoutId,
    destinationLocationId,
    organizationId,
  });
  if (!preparation) throw new NotFoundError("Checkout was not found.");
  const replay = preparation.returns.find(
    (item) => item.idempotencyKey === idempotencyKey,
  );
  if (replay) {
    if (replay.requestSignature !== requestSignature)
      throw new ConflictError(
        "Return idempotency key was reused with different details.",
      );
    const account = await getPosReturnAccount(repositories.returns, {
      checkoutId,
      organizationId,
    });
    return { account, replayed: true, saleReturn: replay };
  }
  if (!preparation.initialPayment)
    throw new BusinessRuleError(
      "Returns are unavailable for a legacy payment checkout.",
    );
  if (
    preparation.order.status !== "FULFILLED" ||
    !preparation.order.fulfillmentMovementId
  )
    throw new BusinessRuleError("Only fulfilled POS sales can be returned.");
  const destination = preparation.destination;
  if (
    !destination ||
    destination.status !== "ACTIVE" ||
    destination.type !== "RETURN_HOLD" ||
    destination.isSellable
  )
    throw new BusinessRuleError(
      "An active non-sellable Return hold location is required.",
    );

  const priorByLine = new Map<string, number>();
  for (const priorReturn of preparation.returns)
    for (const line of priorReturn.lines)
      priorByLine.set(
        line.salesOrderLineId,
        (priorByLine.get(line.salesOrderLineId) ?? 0) + line.quantity,
      );
  const orderLines = new Map(
    preparation.order.lines.map((line) => [line.id, line] as const),
  );
  const returnLines = lines.map((requested) => {
    const orderLine = orderLines.get(requested.salesOrderLineId);
    if (!orderLine)
      throw new BusinessRuleError("Return line does not belong to this sale.");
    const alreadyReturned = priorByLine.get(orderLine.id) ?? 0;
    if (alreadyReturned >= orderLine.quantity)
      throw new BusinessRuleError("The sale line is already fully returned.");
    if (requested.quantity > orderLine.quantity - alreadyReturned)
      throw new BusinessRuleError(
        "Return quantity exceeds the remaining returnable quantity.",
      );
    return {
      colorSnapshot: orderLine.colorSnapshot,
      lineCreditMinor: calculateAllocatedReturnCredit(
        orderLine.lineTotalMinor,
        orderLine.quantity,
        alreadyReturned,
        requested.quantity,
      ),
      productNameSnapshot: orderLine.productNameSnapshot,
      productVariantId: orderLine.productVariantId,
      quantity: requested.quantity,
      salesOrderLineId: orderLine.id,
      sizeSnapshot: orderLine.sizeSnapshot,
      skuSnapshot: orderLine.skuSnapshot,
      unitPriceMinor: orderLine.unitPriceMinor,
    };
  });
  const totalCreditMinor = sumSafe(
    returnLines.map((line) => line.lineCreditMinor),
    "return credit",
  );
  const previousCreditMinor = sumSafe(
    preparation.returns.map((item) => item.totalCreditMinor),
    "cumulative return credit",
  );
  const cumulativeReceivedMinor =
    preparation.initialPayment.paidMinor +
    sumSafe(
      preparation.collections.map((item) => item.amountMinor),
      "cumulative received",
    );
  const settlement = calculateCheckoutSettlement(
    preparation.initialPayment.payableMinor,
    cumulativeReceivedMinor,
    previousCreditMinor + totalCreditMinor,
  );
  const compactId = returnId.replaceAll("-", "").toUpperCase();
  const movement = await createInventoryMovement(repositories.inventory, {
    destinationLocationId,
    idempotencyKey: `pos-return:${compactId}`,
    lines: returnLines.map((line) => ({
      note: null,
      productVariantId: line.productVariantId,
      quantity: line.quantity,
    })),
    movementNumber: `RET-${compactId}`,
    note: "POS sale return received into Return hold",
    occurredAt: input.returnedAt,
    organizationId,
    referenceId: returnId,
    referenceType: "POS_RETURN",
    type: "ADJUSTMENT_IN",
  });
  const postedMovement = await postInventoryMovement(repositories.inventory, {
    movementId: movement.id,
    organizationId,
  });
  const receiptNumber = `RET-${compactId}`;
  const saleReturn = await repositories.returns.create({
    acceptedByUserId,
    checkoutId,
    createdAt: input.returnedAt,
    destinationLocationId,
    id: returnId,
    idempotencyKey,
    inventoryMovementId: postedMovement.id,
    lines: returnLines,
    organizationId,
    reasonCode,
    reasonNote,
    receiptId,
    receiptNumber,
    requestSignature,
    returnedAt: input.returnedAt,
    salesOrderId: preparation.order.id,
    totalCreditMinor,
  });
  await repositories.receipts.createPosReturnReceipt({
    acceptedByName: preparation.acceptedByName,
    adjustedPayableMinor: settlement.adjustedPayableMinor,
    collectedReceiptNumber: preparation.originalReceiptNumber,
    checkoutId,
    cumulativeReceivedMinor,
    cumulativeReturnCreditMinor: settlement.returnCreditMinor,
    destinationLocationName: destination.name,
    id: receiptId,
    lines: saleReturn.lines,
    orderNumber: preparation.order.orderNumber,
    organizationAddressLine1: preparation.organization.addressLine1,
    organizationAddressLine2: preparation.organization.addressLine2,
    organizationCity: preparation.organization.city,
    organizationDistrict: preparation.organization.district,
    organizationEmail: preparation.organization.email,
    organizationId,
    organizationName: preparation.organization.name,
    organizationPhone: preparation.organization.phone,
    organizationPostalCode: preparation.organization.postalCode,
    originalTotalMinor: preparation.initialPayment.payableMinor,
    outstandingMinor: settlement.outstandingMinor,
    reasonCode,
    reasonNote,
    receiptNumber,
    refundableMinor: settlement.refundableMinor,
    returnId,
    returnedAt: input.returnedAt,
    salesOrderId: preparation.order.id,
    settlementStatus: settlement.status,
    totalCreditMinor,
  });
  const account = await getPosReturnAccount(repositories.returns, {
    checkoutId,
    organizationId,
  });
  return { account, replayed: false, saleReturn };
}

export function calculateAllocatedReturnCredit(
  originalLineTotalMinor: number,
  soldQuantity: number,
  alreadyReturnedQuantity: number,
  newReturnQuantity: number,
): number {
  assertNonNegativeInteger(originalLineTotalMinor, "line total");
  assertPositiveInteger(soldQuantity, "sold quantity");
  assertNonNegativeInteger(alreadyReturnedQuantity, "returned quantity");
  assertPositiveInteger(newReturnQuantity, "return quantity");
  if (alreadyReturnedQuantity + newReturnQuantity > soldQuantity)
    throw new BusinessRuleError("Return quantity exceeds sold quantity.");
  const total = BigInt(originalLineTotalMinor);
  const sold = BigInt(soldQuantity);
  const throughBefore = (total * BigInt(alreadyReturnedQuantity)) / sold;
  const throughAfter =
    (total * BigInt(alreadyReturnedQuantity + newReturnQuantity)) / sold;
  const credit = Number(throughAfter - throughBefore);
  assertNonNegativeInteger(credit, "line return credit");
  return credit;
}

function normalizeReturnLines(
  values: readonly { quantity: number; salesOrderLineId: string }[],
) {
  if (values.length === 0)
    throw new ValidationApplicationError(
      "At least one return line is required.",
    );
  if (values.length > 100)
    throw new ValidationApplicationError(
      "Return lines exceed the supported limit.",
    );
  const seen = new Set<string>();
  return values
    .map((line) => {
      const salesOrderLineId = assertId(
        line.salesOrderLineId,
        "salesOrderLineId",
      );
      assertPositiveInteger(line.quantity, "return quantity");
      if (seen.has(salesOrderLineId))
        throw new ValidationApplicationError("Return line is duplicated.");
      seen.add(salesOrderLineId);
      return { quantity: line.quantity, salesOrderLineId };
    })
    .sort((left, right) =>
      left.salesOrderLineId.localeCompare(right.salesOrderLineId),
    );
}

function normalizeReason(value: PosReturnReasonCode): PosReturnReasonCode {
  if (!reasons.includes(value))
    throw new ValidationApplicationError("Return reason is invalid.");
  return value;
}

function normalizeReasonNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const note = value.trim().replace(/\s+/gu, " ");
  if (!note) return null;
  if (note.length > 500)
    throw new ValidationApplicationError("Return note is too long.");
  return note;
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/u.test(key))
    throw new ValidationApplicationError("idempotencyKey is invalid.");
  return key;
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value))
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  return value;
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new ValidationApplicationError(`${field} is invalid.`);
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647)
    throw new ValidationApplicationError(`${field} is invalid.`);
}

function sumSafe(values: readonly number[], field: string): number {
  let total = 0;
  for (const value of values) {
    assertNonNegativeInteger(value, field);
    total += value;
    if (!Number.isSafeInteger(total) || total > 2_147_483_647)
      throw new ValidationApplicationError(
        `${field} exceeds the supported range.`,
      );
  }
  return total;
}
