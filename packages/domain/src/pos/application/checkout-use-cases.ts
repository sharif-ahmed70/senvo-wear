import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import {
  confirmSalesOrder,
  createSalesOrder,
  fulfillSalesOrder,
  reserveSalesOrder,
} from "../../sales/application/order-use-cases.js";
import type { SalesOrderRepository } from "../../sales/repositories/sales-order-repositories.js";
import {
  calculatePaymentBalance,
  createPaymentRequestSignature,
  normalizePaymentInstructions,
} from "../../payment/application/payment-rules.js";
import type { PaymentMethod } from "../../payment/domain/models.js";
import type { PaymentRepository } from "../../payment/repositories/payment-repository.js";
import type { ReceiptRepository } from "../../receipt/repositories/receipt-repository.js";
import type { PosCheckout, PosCheckoutPreparation } from "../domain/models.js";
import type { PosCheckoutRepository } from "../repositories/pos-checkout-repository.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type PosCheckoutSalesOrderRepository = Pick<
  SalesOrderRepository,
  "confirm" | "createDraft" | "findByIdempotencyKey" | "fulfill" | "reserve"
>;

export async function checkoutCart(
  repositories: {
    checkouts: PosCheckoutRepository;
    payments: PaymentRepository;
    receipts: ReceiptRepository;
    salesOrders: PosCheckoutSalesOrderRepository;
  },
  input: {
    allowOutstanding: boolean;
    approveOutstanding(): Promise<void>;
    cartId: string;
    checkoutId: string;
    completedAt: Date;
    customer?: {
      email: string | null;
      id: string;
      name: string;
      phone: string;
    } | null;
    discountMinor?: number;
    idempotencyKey: string;
    organizationId: string;
    paymentBatchId: string;
    payments: readonly {
      amountMinor: number;
      method: PaymentMethod;
      reference?: string | null;
    }[];
    receiptId: string;
    staffId: string;
  },
): Promise<{ checkout: PosCheckout; replayed: boolean }> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const cartId = assertId(input.cartId, "cartId");
  const staffId = assertId(input.staffId, "staffId");
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const paymentBatchId = assertId(input.paymentBatchId, "paymentBatchId");
  const receiptId = assertId(input.receiptId, "receiptId");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const discountMinor = input.discountMinor ?? 0;
  const payments = normalizePaymentInstructions(
    input.payments,
    input.allowOutstanding,
  );
  const paymentRequestSignature = createPaymentRequestSignature(
    payments,
    input.allowOutstanding,
    input.customer || discountMinor
      ? {
          customerId: input.customer?.id ?? null,
          discountMinor,
        }
      : undefined,
  );
  const preparation = await repositories.checkouts.prepare(
    cartId,
    organizationId,
  );
  if (!preparation) throw new NotFoundError("Cart was not found.");
  if (preparation.checkout) {
    if (preparation.checkout.idempotencyKey !== idempotencyKey) {
      throw new ConflictError(
        "This cart was already checked out with another idempotency key.",
      );
    }
    if (
      preparation.checkout.paymentRequestSignature === null ||
      preparation.checkout.paymentRequestSignature !== paymentRequestSignature
    ) {
      throw new ConflictError(
        "Checkout idempotency key was reused with different payment instructions.",
      );
    }
    return { checkout: preparation.checkout, replayed: true };
  }
  validatePreparation(preparation, staffId);
  const balance = calculatePaymentBalance(
    checkoutTotal(preparation, discountMinor),
    payments,
    input.allowOutstanding,
  );
  if (balance.outstandingMinor > 0) await input.approveOutstanding();

  const suffix = checkoutId.replaceAll("-", "").slice(0, 20).toUpperCase();
  const orderKey = `pos:${preparation.salesSessionId}:${idempotencyKey}`;
  const lines = preparation.lines.map((line) => ({
    productVariantId: line.productVariantId,
    quantity: line.quantity,
    unitPriceMinor: line.sellingPriceMinor,
  }));
  const draft = await createSalesOrder(repositories.salesOrders, {
    allocationPolicyId: preparation.allocationPolicyId,
    boothId:
      preparation.counterType === "EVENT_BOOTH" ? preparation.boothId : null,
    channel:
      preparation.counterType === "EVENT_BOOTH"
        ? "EVENT_BOOTH"
        : "OFFLINE_STORE",
    currencyCode: "BDT",
    customerEmail: input.customer?.email,
    customerId: input.customer?.id,
    customerName: input.customer?.name,
    customerPhone: input.customer?.phone,
    idempotencyKey: orderKey,
    lines,
    note: `POS checkout ${checkoutId}`,
    orderDiscountMinor: discountMinor,
    orderNumber: `POS-${suffix}`,
    organizationId,
  });
  const reserved = await reserveSalesOrder(repositories.salesOrders, {
    expectedVersion: draft.version,
    organizationId,
    preferredBranchId: preparation.branchId,
    reservationIdempotencyKey: `${orderKey}:reservation`,
    reservationNumber: `RSV-${suffix}`,
    salesOrderId: draft.id,
  });
  const confirmed = await confirmSalesOrder(repositories.salesOrders, {
    expectedVersion: reserved.version,
    organizationId,
    salesOrderId: draft.id,
  });
  const fulfilled = await fulfillSalesOrder(repositories.salesOrders, {
    consumptionIdempotencyKey: `${orderKey}:consumption`,
    expectedVersion: confirmed.version,
    movementNumber: `POS-${suffix}`,
    note: `POS checkout ${checkoutId}`,
    occurredAt: input.completedAt,
    organizationId,
    salesOrderId: draft.id,
  });
  const checkoutRecord = await repositories.checkouts.createCompleted({
    cartId,
    completedAt: input.completedAt,
    counterId: preparation.counterId,
    id: checkoutId,
    idempotencyKey,
    organizationId,
    salesOrderId: fulfilled.id,
    salesSessionId: preparation.salesSessionId,
    staffId,
    subtotalMinor: fulfilled.subtotalMinor,
    totalMinor: fulfilled.totalMinor,
  });
  const payment = await repositories.payments.create({
    checkoutId: checkoutRecord.id,
    counterId: preparation.counterId,
    createdAt: input.completedAt,
    currencyCode: "BDT",
    id: paymentBatchId,
    idempotencyKey,
    lines: payments,
    organizationId,
    outstandingMinor: balance.outstandingMinor,
    paidMinor: balance.paidMinor,
    payableMinor: fulfilled.totalMinor,
    requestSignature: paymentRequestSignature,
    salesOrderId: fulfilled.id,
    salesSessionId: preparation.salesSessionId,
    staffId,
    status: balance.status,
  });
  const receipt = await repositories.receipts.create({
    checkoutId: checkoutRecord.id,
    counterCode: preparation.counterCode,
    counterName: preparation.counterName,
    currencyCode: "BDT",
    customerEmail: fulfilled.customerEmail,
    customerName: fulfilled.customerName,
    customerPhone: fulfilled.customerPhone,
    deliveryMinor: fulfilled.deliveryMinor,
    discountMinor: fulfilled.discountMinor,
    id: receiptId,
    issuedAt: input.completedAt,
    lines: fulfilled.lines.map((line) => ({
      color: line.colorSnapshot,
      discountMinor: line.discountMinor,
      lineNumber: line.lineNumber,
      lineTotalMinor: line.lineTotalMinor,
      productName: line.productNameSnapshot,
      quantity: line.quantity,
      size: line.sizeSnapshot,
      sku: line.skuSnapshot,
      unitPriceMinor: line.unitPriceMinor,
    })),
    orderNumber: fulfilled.orderNumber,
    organizationAddressLine1: preparation.organizationAddressLine1,
    organizationAddressLine2: preparation.organizationAddressLine2,
    organizationCity: preparation.organizationCity,
    organizationDistrict: preparation.organizationDistrict,
    organizationEmail: preparation.organizationEmail,
    organizationId,
    organizationName: preparation.organizationName,
    organizationPhone: preparation.organizationPhone,
    organizationPostalCode: preparation.organizationPostalCode,
    outstandingMinor: balance.outstandingMinor,
    paidMinor: balance.paidMinor,
    paymentBatchId: payment.id,
    paymentStatus: balance.status,
    payments: payment.lines.map((line) => ({
      amountMinor: line.amountMinor,
      lineNumber: line.lineNumber,
      method: line.method,
      reference: line.reference,
    })),
    receiptNumber: `RCP-${suffix}`,
    salesChannel:
      preparation.counterType === "EVENT_BOOTH"
        ? "EVENT_BOOTH"
        : "OFFLINE_STORE",
    salesOrderId: fulfilled.id,
    sourceName: preparation.sourceName,
    staffName: preparation.staffName,
    subtotalMinor: fulfilled.subtotalMinor,
    totalMinor: fulfilled.totalMinor,
  });
  const checkout: PosCheckout = {
    ...checkoutRecord,
    outstandingMinor: balance.outstandingMinor,
    paidMinor: balance.paidMinor,
    paymentBatchId: payment.id,
    paymentRequestSignature,
    paymentStatus: balance.status,
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
  };
  return { checkout, replayed: false };
}

export async function getCheckoutStatus(
  repository: PosCheckoutRepository,
  input: { checkoutId: string; organizationId: string },
): Promise<PosCheckout> {
  const checkout = await repository.findById(
    assertId(input.checkoutId, "checkoutId"),
    assertId(input.organizationId, "organizationId"),
  );
  if (!checkout) throw new NotFoundError("Checkout was not found.");
  return checkout;
}

export function listCheckoutHistory(
  repository: PosCheckoutRepository,
  organizationId: string,
): Promise<PosCheckout[]> {
  return repository.list(assertId(organizationId, "organizationId"));
}

function validatePreparation(
  preparation: Awaited<ReturnType<PosCheckoutRepository["prepare"]>> & {},
  staffId: string,
): void {
  if (preparation.sessionStatus !== "OPEN")
    throw new BusinessRuleError("The sales session is closed.");
  if (preparation.counterStatus !== "ACTIVE")
    throw new BusinessRuleError("The sales counter is inactive.");
  if (preparation.staffId !== staffId)
    throw new BusinessRuleError("Checkout must use the active session staff.");
  if (preparation.staffStatus !== "ACTIVE")
    throw new BusinessRuleError("The team member is not active.");
  if (preparation.membershipStatus !== "ACTIVE")
    throw new BusinessRuleError("The team membership is not active.");
  if (!preparation.allocationPolicyId)
    throw new BusinessRuleError("No active inventory allocation is available.");
  if (preparation.lines.length === 0)
    throw new BusinessRuleError("Add an item before checkout.");
  for (const line of preparation.lines) {
    if (line.variantStatus !== "ACTIVE")
      throw new BusinessRuleError("A cart item is no longer active.");
    if (!line.hasActiveBarcode)
      throw new BusinessRuleError("A cart item barcode is no longer active.");
    subtotal(line.sellingPriceMinor, line.quantity);
  }
}

function assertId(value: string, field: string): string {
  if (!uuidPattern.test(value))
    throw new ValidationApplicationError(`${field} must be a valid UUID.`);
  return value;
}

function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/u.test(key))
    throw new ValidationApplicationError("idempotencyKey is invalid.");
  return key;
}

function subtotal(price: number, quantity: number): number {
  const value = price * quantity;
  if (
    !Number.isInteger(price) ||
    price < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(value) ||
    value > 2_147_483_647
  ) {
    throw new ValidationApplicationError("Cart total is invalid.");
  }
  return value;
}

function checkoutTotal(
  preparation: PosCheckoutPreparation,
  discountMinor: number,
): number {
  let total = 0;
  for (const line of preparation.lines) {
    const next = total + subtotal(line.sellingPriceMinor, line.quantity);
    if (!Number.isSafeInteger(next) || next > 2_147_483_647) {
      throw new ValidationApplicationError("Cart total is invalid.");
    }
    total = next;
  }
  if (
    !Number.isInteger(discountMinor) ||
    discountMinor < 0 ||
    discountMinor > total
  )
    throw new ValidationApplicationError("Checkout discount is invalid.");
  return total - discountMinor;
}
