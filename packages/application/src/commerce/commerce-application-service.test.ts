import type { CommerceRepository } from "@senvo/domain";
import { AuthorizationError } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationTransactionManager } from "../context/transaction.js";
import { CommerceApplicationService } from "./commerce-application-service.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const vendorId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const variantId = "10000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-24T10:00:00.000Z");
const context = {
  actorId: userId,
  actorType: "INTERNAL" as const,
  authenticationState: "AUTHENTICATED" as const,
  organizationId,
  requestId: "request-commerce-001",
  source: "ADMIN" as const,
  userId,
};

describe("CommerceApplicationService", () => {
  it("injects organization identity and rejects it from browser payloads", async () => {
    const createCustomer = vi.fn().mockImplementation((input) =>
      Promise.resolve({
        ...input,
        dueMinor: 0,
        status: "ACTIVE",
        totalPurchaseMinor: 0,
        updatedAt: now,
        version: 1,
      }),
    );
    const service = serviceWith({ createCustomer });
    const created = await service.createCustomer(context, {
      name: "Buyer",
      phone: "01700000000",
    });
    expect(created.ok).toBe(true);
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
    );
    const rejected = await service.createCustomer(context, {
      name: "Buyer",
      organizationId,
      phone: "01700000000",
    });
    expect(rejected).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      ok: false,
    });
  });

  it("runs purchase receipt and audit in the same outer transaction", async () => {
    const receivePurchase = vi.fn().mockResolvedValue({
      purchase: {
        destinationLocationId: locationId,
        destinationLocationName: "Main stock",
        dueMinor: 1500,
        id: "10000000-0000-4000-8000-000000000006",
        inventoryMovementId: "10000000-0000-4000-8000-000000000007",
        lines: [
          {
            lineTotalMinor: 2000,
            productName: "Shirt",
            productVariantId: variantId,
            quantity: 2,
            sku: "SHIRT-BLK-M",
            unitCostMinor: 1000,
          },
        ],
        orderedAt: now,
        paidMinor: 500,
        purchaseNumber: "PO-TEST",
        receivedAt: now,
        status: "RECEIVED",
        totalMinor: 2000,
        vendorId,
        vendorName: "Supplier",
        version: 1,
      },
      replayed: false,
    });
    const audit = vi.fn().mockResolvedValue(undefined);
    let executeCalls = 0;
    const execute: ApplicationTransactionManager["execute"] = (
      trusted,
      operation,
    ) => {
      executeCalls += 1;
      return operation({
        applicationContext: trusted,
        auditWriter: { recordWithinTransaction: audit },
        commerceRepository: repository({ receivePurchase }),
      } as never);
    };
    const service = serviceWith({}, { execute });
    const result = await service.receivePurchase(context, {
      destinationLocationId: locationId,
      idempotencyKey: "purchase-attempt-001",
      lines: [
        { productVariantId: variantId, quantity: 2, unitCostMinor: 1000 },
      ],
      paidMinor: 500,
      paymentMethod: "CASH",
      vendorId,
    });
    expect(result.ok).toBe(true);
    expect(executeCalls).toBe(1);
    expect(receivePurchase).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
    );
  });

  it("stops before repository access when authorization fails", async () => {
    const createVendor = vi.fn();
    const service = serviceWith({ createVendor }, undefined, {
      authorize: () => Promise.reject(new AuthorizationError("Denied.")),
    });
    const result = await service.createVendor(context, { name: "Supplier" });
    expect(result.ok).toBe(false);
    expect(createVendor).not.toHaveBeenCalled();
  });
});

function serviceWith(
  overrides: Partial<CommerceRepository>,
  transactionManager?: ApplicationTransactionManager,
  authorizationService?: {
    authorize: () => Promise<void>;
  },
) {
  return new CommerceApplicationService({
    authorizationService,
    clock: { now: () => now },
    repository: repository(overrides),
    transactionManager:
      transactionManager ??
      ({
        execute: () => Promise.reject(new Error("Unexpected transaction.")),
      } as ApplicationTransactionManager),
  });
}

function repository(
  overrides: Partial<CommerceRepository>,
): CommerceRepository {
  const unused = () => Promise.reject(new Error("Unexpected repository call."));
  return {
    createCustomer: unused,
    createVendor: unused,
    findCustomer: unused,
    listCustomers: unused,
    listPurchases: unused,
    listVendors: unused,
    receivePurchase: unused,
    recordVendorPayment: unused,
    updateCustomer: unused,
    updateVendor: unused,
    ...overrides,
  };
}
