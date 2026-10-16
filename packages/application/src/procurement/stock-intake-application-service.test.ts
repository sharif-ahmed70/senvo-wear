import {
  AuthorizationError,
  BusinessRuleError,
  StockIntakeIdempotencyConflictError,
  SupplierPaymentIdempotencyConflictError,
  type RecordStockIntakeOutcome,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import type {
  ApplicationTransactionContext,
  ApplicationTransactionManager,
} from "../context/transaction.js";
import {
  StockIntakeApplicationService,
  stockIntakeRequiredPermissions,
} from "./stock-intake-application-service.js";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "99999999-9999-4999-8999-999999999999";
const locationId = "44444444-4444-4444-8444-444444444444";
const productId = "55555555-5555-4555-8555-555555555555";
const variantId = "66666666-6666-4666-8666-666666666666";
const purchaseId = "77777777-7777-4777-8777-777777777777";
const supplierId = "88888888-8888-4888-8888-888888888888";

const context: ApplicationExecutionContext = {
  organizationId,
  requestId: "req-stock-intake-1",
  userId,
};

const payload = {
  idempotencyKey: "intake-key-0001",
  lines: [
    {
      colorName: "Black",
      quantity: 2,
      sellingPriceMinor: 90_000,
      sizeName: "M",
      unitCostMinor: 50_000,
    },
  ],
  payment: { amountMinor: 10_000, method: "CASH" },
  product: {
    audienceCategoryName: "Men",
    name: "Classic Crew Tee",
    typeCategoryName: "T-shirt",
  },
  purchase: {
    destinationLocationId: locationId,
    memoNumber: "MEMO-1",
    purchaseDate: "2026-09-30",
  },
  supplier: null,
  transportCostMinor: 0,
};

const outcome: RecordStockIntakeOutcome = {
  replayed: false,
  result: {
    dueMinor: "90000",
    payment: { amountMinor: "10000", id: purchaseId, method: "CASH" },
    product: { code: "TSH-0001", id: productId, name: "Classic Crew Tee" },
    purchase: {
      id: purchaseId,
      purchaseNumber: "MEMO-1",
      totalCostMinor: "100000",
    },
    supplier: { id: supplierId, name: "নিজে কেনা" },
    transportAppliedMinor: 0,
    transportRequestedMinor: 0,
    variants: [
      {
        barcode: "SV-TEST-0001",
        color: "Black",
        id: variantId,
        quantity: 2,
        sellingPriceMinor: 90_000,
        size: "M",
        sku: "TSH-0001-BLACK-M",
        unitCostMinor: 50_000,
      },
    ],
  },
};

function transactionManagerReturning(
  execute: ApplicationTransactionManager["execute"],
): ApplicationTransactionManager {
  return { execute };
}

describe("StockIntakeApplicationService", () => {
  it("requires catalog, inventory and procurement permissions before the transaction", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue(outcome);
    const service = new StockIntakeApplicationService({
      authorizationService: { authorize },
      transactionManager: transactionManagerReturning(execute),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result).toEqual({
      data: { ...outcome.result, replayed: false },
      ok: true,
    });
    expect(authorize.mock.calls.map((call) => call[1] as unknown)).toEqual(
      stockIntakeRequiredPermissions,
    );
    expect(stockIntakeRequiredPermissions).toEqual([
      { action: "CREATE", resource: "CATALOG" },
      { action: "UPDATE", resource: "CATALOG" },
      { action: "CREATE", resource: "INVENTORY" },
      { action: "UPDATE", resource: "INVENTORY" },
      { action: "CREATE", resource: "PROCUREMENT" },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("also requires PROCUREMENT:UPDATE when an existing supplier is updated", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue(outcome);
    const service = new StockIntakeApplicationService({
      authorizationService: { authorize },
      transactionManager: transactionManagerReturning(execute),
    });

    await service.recordStockIntake(context, {
      ...payload,
      supplier: {
        existingSupplierId: supplierId,
        updates: { phone: "01900000000" },
      },
    });

    expect(authorize.mock.calls.map((call) => call[1] as unknown)).toEqual([
      ...stockIntakeRequiredPermissions,
      { action: "UPDATE", resource: "PROCUREMENT" },
    ]);
  });

  it("does not require PROCUREMENT:UPDATE for an existing supplier without updates", async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const service = new StockIntakeApplicationService({
      authorizationService: { authorize },
      transactionManager: transactionManagerReturning(
        vi.fn().mockResolvedValue(outcome),
      ),
    });

    await service.recordStockIntake(context, {
      ...payload,
      supplier: { existingSupplierId: supplierId },
    });

    expect(authorize.mock.calls.map((call) => call[1] as unknown)).toEqual(
      stockIntakeRequiredPermissions,
    );
  });

  it("rejects a supplier update without PROCUREMENT:UPDATE and never opens the transaction", async () => {
    const execute = vi.fn();
    const service = new StockIntakeApplicationService({
      authorizationService: {
        authorize: vi.fn(
          (_context, permission: { action: string; resource: string }) =>
            permission.resource === "PROCUREMENT" &&
            permission.action === "UPDATE"
              ? Promise.reject(new AuthorizationError("Denied"))
              : Promise.resolve(),
        ),
      },
      transactionManager: transactionManagerReturning(execute),
    });

    const result = await service.recordStockIntake(context, {
      ...payload,
      supplier: {
        existingSupplierId: supplierId,
        updates: { address: "Babubazar" },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps a supplier payment key collision to an idempotency conflict", async () => {
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(
        vi
          .fn()
          .mockRejectedValue(new SupplierPaymentIdempotencyConflictError()),
      ),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("stops without a transaction when any permission is missing", async () => {
    const execute = vi.fn();
    const service = new StockIntakeApplicationService({
      authorizationService: {
        authorize: vi.fn((_context, permission: { resource: string }) =>
          permission.resource === "INVENTORY"
            ? Promise.reject(new AuthorizationError("Denied"))
            : Promise.resolve(),
        ),
      },
      transactionManager: transactionManagerReturning(execute),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects trusted identity fields and unknown keys in the payload", async () => {
    const execute = vi.fn();
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(execute),
    });

    const result = await service.recordStockIntake(context, {
      ...payload,
      organizationId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires a selling price on color and size lines", async () => {
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(vi.fn()),
    });

    const result = await service.recordStockIntake(context, {
      ...payload,
      lines: [
        { colorName: "Black", quantity: 1, sizeName: "M", unitCostMinor: 1 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("runs in the trusted context and fails safely without transactional repositories", async () => {
    let captured: unknown;
    const execute = async <TResult>(
      validated: Parameters<ApplicationTransactionManager["execute"]>[0],
      operation: (
        transaction: ApplicationTransactionContext,
      ) => Promise<TResult>,
    ): Promise<TResult> => {
      captured = validated;
      await expect(
        operation({
          applicationContext: validated,
          auditWriter: { recordWithinTransaction: vi.fn() },
          inventoryMovementRepository: {} as never,
          salesOrderRepository: {} as never,
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
      return outcome as TResult;
    };
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(execute),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result.ok).toBe(true);
    expect(captured).toMatchObject({ organizationId, userId });
  });

  it("marks replayed results", async () => {
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(
        vi.fn().mockResolvedValue({ ...outcome, replayed: true }),
      ),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result.ok && result.data.replayed).toBe(true);
  });

  it("maps a reused idempotency key with different details to an idempotency conflict", async () => {
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(
        vi.fn().mockRejectedValue(new StockIntakeIdempotencyConflictError()),
      ),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("surfaces business rule messages to the operator", async () => {
    const service = new StockIntakeApplicationService({
      transactionManager: transactionManagerReturning(
        vi
          .fn()
          .mockRejectedValue(
            new BusinessRuleError("Transport cost cannot be split exactly."),
          ),
      ),
    });

    const result = await service.recordStockIntake(context, payload);

    expect(result).toMatchObject({
      error: {
        code: "BUSINESS_RULE_VIOLATION",
        message: "Transport cost cannot be split exactly.",
      },
      ok: false,
    });
  });
});
