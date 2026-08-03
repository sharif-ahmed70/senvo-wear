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
import type { PosCheckout } from "../domain/models.js";
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
    salesOrders: PosCheckoutSalesOrderRepository;
  },
  input: {
    cartId: string;
    checkoutId: string;
    completedAt: Date;
    idempotencyKey: string;
    organizationId: string;
    staffId: string;
  },
): Promise<{ checkout: PosCheckout; replayed: boolean }> {
  const organizationId = assertId(input.organizationId, "organizationId");
  const cartId = assertId(input.cartId, "cartId");
  const staffId = assertId(input.staffId, "staffId");
  const checkoutId = assertId(input.checkoutId, "checkoutId");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
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
    return { checkout: preparation.checkout, replayed: true };
  }
  validatePreparation(preparation, staffId);

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
    idempotencyKey: orderKey,
    lines,
    note: `POS checkout ${checkoutId}`,
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
  const checkout = await repositories.checkouts.createCompleted({
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
