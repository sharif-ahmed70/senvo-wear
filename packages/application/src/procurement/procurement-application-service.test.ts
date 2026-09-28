import {
  AuthorizationError,
  ConflictError,
  type Supplier,
  type SupplierRepository,
} from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApplicationExecutionContext } from "../context/execution-context.js";
import { ProcurementApplicationService } from "./procurement-application-service.js";

describe("ProcurementApplicationService", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const otherOrgId = "22222222-2222-4222-8222-222222222222";
  const supplierId = "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa";

  const validContext: ApplicationExecutionContext = {
    organizationId: orgId,
    permissions: [
      { action: "CREATE", resource: "PROCUREMENT" },
      { action: "READ", resource: "PROCUREMENT" },
      { action: "UPDATE", resource: "PROCUREMENT" },
    ],
    requestId: "req-12345678",
    userId: "99999999-9999-4999-8999-999999999999",
  };

  function createMockSupplier(overrides?: Partial<Supplier>): Supplier {
    return {
      address: "Babubazar, Dhaka",
      code: "SUP-001",
      contactPerson: "Rahim Chowdhury",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      email: "rahim@supplier.test",
      id: supplierId,
      name: "Babubazar Textiles",
      notes: "Denim supplier",
      organizationId: orgId,
      phone: "+8801711000000",
      status: "ACTIVE",
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      ...overrides,
    };
  }

  function createMockRepository(): {
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } {
    return {
      create: vi.fn(),
      deactivate: vi.fn(),
      findByCode: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
    };
  }

  describe("createSupplier", () => {
    it("authorizes and creates a supplier for the organization", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.create.mockResolvedValue(mockSupplier);

      const authorizeMock = vi.fn().mockResolvedValue(undefined);
      const service = new ProcurementApplicationService({
        authorizationService: { authorize: authorizeMock },
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        address: "Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@supplier.test",
        name: "Babubazar Textiles",
        notes: "Denim supplier",
        phone: "+8801711000000",
      });

      expect(authorizeMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
        { action: "CREATE", resource: "PROCUREMENT" },
      );
      expect(repository.create).toHaveBeenCalledWith({
        address: "Babubazar, Dhaka",
        code: "SUP-001",
        contactPerson: "Rahim Chowdhury",
        email: "rahim@supplier.test",
        name: "Babubazar Textiles",
        notes: "Denim supplier",
        organizationId: orgId,
        phone: "+8801711000000",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(supplierId);
        expect(result.data.code).toBe("SUP-001");
        expect(result.data.name).toBe("Babubazar Textiles");
      }
    });

    it("rejects when authorization fails", async () => {
      const repository = createMockRepository();
      const service = new ProcurementApplicationService({
        authorizationService: {
          authorize: vi
            .fn()
            .mockRejectedValue(new AuthorizationError("Denied")),
        },
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        code: "SUP-001",
        name: "Babubazar Textiles",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN");
      }
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("handles conflict error on duplicate supplier code", async () => {
      const repository = createMockRepository();
      repository.create.mockRejectedValue(
        new ConflictError("Supplier with this code already exists."),
      );

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createSupplier(validContext, {
        code: "SUP-001",
        name: "Babubazar Textiles",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("CONFLICT");
      }
    });
  });

  describe("getSupplier", () => {
    it("returns supplier details when found", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(mockSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(validContext, {
        supplierId,
      });

      expect(repository.findById).toHaveBeenCalledWith(supplierId, orgId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(supplierId);
        expect(result.data.name).toBe("Babubazar Textiles");
      }
    });

    it("returns NOT_FOUND when supplier does not exist", async () => {
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("enforces tenant isolation by querying only the context organization", async () => {
      const repository = createMockRepository();
      repository.findById.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getSupplier(
        { ...validContext, organizationId: otherOrgId },
        { supplierId },
      );

      expect(repository.findById).toHaveBeenCalledWith(supplierId, otherOrgId);
      expect(result.ok).toBe(false);
    });
  });

  describe("listSuppliers", () => {
    it("lists suppliers scoped to the organization with filters", async () => {
      const mockSupplier = createMockSupplier();
      const repository = createMockRepository();
      repository.list.mockResolvedValue([mockSupplier]);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.listSuppliers(validContext, {
        search: "Babubazar",
        status: "ACTIVE",
      });

      expect(repository.list).toHaveBeenCalledWith({
        organizationId: orgId,
        search: "Babubazar",
        status: "ACTIVE",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.name).toBe("Babubazar Textiles");
      }
    });
  });

  describe("updateSupplier", () => {
    it("updates supplier fields and returns updated contract", async () => {
      const updatedSupplier = createMockSupplier({
        name: "Babubazar Textiles Ltd.",
        phone: "+8801799999999",
      });
      const repository = createMockRepository();
      repository.update.mockResolvedValue(updatedSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.updateSupplier(validContext, {
        name: "Babubazar Textiles Ltd.",
        phone: "+8801799999999",
        supplierId,
      });

      expect(repository.update).toHaveBeenCalledWith({
        address: undefined,
        code: undefined,
        contactPerson: undefined,
        email: undefined,
        id: supplierId,
        name: "Babubazar Textiles Ltd.",
        notes: undefined,
        organizationId: orgId,
        phone: "+8801799999999",
        status: undefined,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe("Babubazar Textiles Ltd.");
        expect(result.data.phone).toBe("+8801799999999");
      }
    });

    it("returns NOT_FOUND when updating non-existent supplier", async () => {
      const repository = createMockRepository();
      repository.update.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.updateSupplier(validContext, {
        name: "Babubazar Textiles Ltd.",
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("deactivateSupplier", () => {
    it("soft-deactivates supplier and returns updated contract", async () => {
      const deactivatedSupplier = createMockSupplier({ status: "INACTIVE" });
      const repository = createMockRepository();
      repository.deactivate.mockResolvedValue(deactivatedSupplier);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.deactivateSupplier(validContext, {
        supplierId,
      });

      expect(repository.deactivate).toHaveBeenCalledWith(supplierId, orgId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("INACTIVE");
      }
    });

    it("returns NOT_FOUND when deactivating non-existent supplier", async () => {
      const repository = createMockRepository();
      repository.deactivate.mockResolvedValue(null);

      const service = new ProcurementApplicationService({
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.deactivateSupplier(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("Purchase operations", () => {
    const locationId = "44444444-4444-4444-8444-444444444444";
    const variantId = "55555555-5555-4555-8555-555555555555";
    const purchaseId = "77777777-7777-4777-8777-777777777777";
    const movementId = "88888888-8888-4888-8888-888888888888";

    const lineId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

    function createMockPurchaseRecord(overrides?: Partial<any>) {
      return {
        createdAt: new Date("2026-09-27T00:00:00.000Z"),
        destinationLocationId: locationId,
        expectedDeliveryDate: null,
        id: purchaseId,
        idempotencyKey: null,
        lines: [
          {
            createdAt: new Date("2026-09-27T00:00:00.000Z"),
            id: lineId,
            lineNumber: 1,
            notes: null,
            organizationId: orgId,
            productName: "Classic Shirt",
            productVariantId: variantId,
            purchaseId,
            quantity: 50,
            sku: "SHIRT-M",
            totalCostMinor: 2500000n,
            unitCostMinor: 50000,
            updatedAt: new Date("2026-09-27T00:00:00.000Z"),
            variantName: "Black / M",
          },
        ],
        notes: "Test purchase",
        organizationId: orgId,
        purchaseDate: new Date("2026-09-27T00:00:00.000Z"),
        purchaseNumber: "PO-20260927-001",
        receiptMovementId: null,
        status: "DRAFT",
        supplierId,
        totalCostMinor: 2500000n,
        updatedAt: new Date("2026-09-27T00:00:00.000Z"),
        ...overrides,
      };
    }

    it("creates a purchase draft with valid permissions", async () => {
      const repository = createMockRepository();
      const mockPurchase = createMockPurchaseRecord();

      const mockPurchaseRepo = {
        create: vi.fn().mockResolvedValue(mockPurchase),
        findById: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findByPurchaseNumber: vi.fn(),
        list: vi.fn(),
        update: vi.fn(),
      };

      const service = new ProcurementApplicationService({
        purchases: mockPurchaseRepo as any,
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.createPurchaseDraft(validContext, {
        destinationLocationId: locationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Classic Shirt",
            productVariantId: variantId,
            quantity: 50,
            sku: "SHIRT-M",
            unitCostMinor: 50000,
          },
        ],
        notes: "Test purchase",
        purchaseNumber: "PO-20260927-001",
        supplierId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(purchaseId);
        expect(result.data.status).toBe("DRAFT");
        expect(result.data.totalCostMinor).toBe("2500000");
      }
    });

    it("rejects purchase draft creation without PROCUREMENT:CREATE permission", async () => {
      const repository = createMockRepository();
      const service = new ProcurementApplicationService({
        authorizationService: {
          authorize: vi
            .fn()
            .mockRejectedValue(new AuthorizationError("Denied")),
        },
        purchases: {} as any,
        suppliers: repository as unknown as SupplierRepository,
      });

      const readOnlyContext: ApplicationExecutionContext = {
        ...validContext,
        permissions: [{ action: "READ", resource: "PROCUREMENT" }],
      };

      const result = await service.createPurchaseDraft(readOnlyContext, {
        destinationLocationId: locationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Classic Shirt",
            productVariantId: variantId,
            quantity: 50,
            sku: "SHIRT-M",
            unitCostMinor: 50000,
          },
        ],
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN");
      }
    });

    it("retrieves a purchase by id with valid permissions", async () => {
      const repository = createMockRepository();
      const mockPurchase = createMockPurchaseRecord();

      const mockPurchaseRepo = {
        create: vi.fn(),
        findById: vi.fn().mockResolvedValue(mockPurchase),
        findByIdempotencyKey: vi.fn(),
        findByPurchaseNumber: vi.fn(),
        list: vi.fn(),
        update: vi.fn(),
      };

      const service = new ProcurementApplicationService({
        purchases: mockPurchaseRepo as any,
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.getPurchase(validContext, {
        purchaseId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(purchaseId);
        expect(result.data.lines).toHaveLength(1);
      }
    });

    it("lists purchases with valid permissions", async () => {
      const repository = createMockRepository();
      const mockPurchase = createMockPurchaseRecord();

      const mockPurchaseRepo = {
        create: vi.fn(),
        findById: vi.fn(),
        findByIdempotencyKey: vi.fn(),
        findByPurchaseNumber: vi.fn(),
        list: vi.fn().mockResolvedValue([mockPurchase]),
        update: vi.fn(),
      };

      const service = new ProcurementApplicationService({
        purchases: mockPurchaseRepo as any,
        suppliers: repository as unknown as SupplierRepository,
      });

      const result = await service.listPurchases(validContext, {
        status: "DRAFT",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
      }
    });

    it("confirms a purchase atomically via transaction manager", async () => {
      const repository = createMockRepository();
      const draftPurchase = createMockPurchaseRecord({ status: "DRAFT" });
      const postedPurchase = {
        ...draftPurchase,
        receiptMovementId: movementId,
        status: "POSTED",
      };

      const mockPurchaseRepo = {
        create: vi.fn(),
        findById: vi
          .fn()
          .mockResolvedValueOnce(draftPurchase)
          .mockResolvedValueOnce(postedPurchase),
        findByIdempotencyKey: vi.fn(),
        findByPurchaseNumber: vi.fn(),
        list: vi.fn(),
        update: vi.fn().mockResolvedValue(postedPurchase),
      };

      const mockCostRepo = {
        getCostState: vi.fn().mockResolvedValue(null),
        getSaleLineCostSnapshot: vi.fn(),
        getVariantOnHandQuantity: vi.fn().mockResolvedValue(50),
        listCostEntries: vi.fn(),
        recordCostEntry: vi.fn().mockResolvedValue({}),
        recordSaleLineCostSnapshot: vi.fn(),
        upsertCostState: vi.fn().mockResolvedValue({}),
      };

      const mockMovement = {
        consumedReservationId: null,
        createdAt: new Date(),
        destinationLocationId: locationId,
        id: movementId,
        idempotencyKey: `receipt:purchase:${purchaseId}`,
        lines: [
          {
            createdAt: new Date(),
            id: "mov-l-1",
            lineNumber: 1,
            movementId,
            note: null,
            organizationId: orgId,
            productVariantId: variantId,
            quantity: 50,
            updatedAt: new Date(),
          },
        ],
        movementNumber: `REC-${draftPurchase.purchaseNumber}`,
        note: null,
        occurredAt: new Date(),
        organizationId: orgId,
        referenceId: purchaseId,
        referenceType: "PURCHASE",
        reversalReason: null,
        reversedByMovementId: null,
        reversesMovementId: null,
        sourceLocationId: null,
        status: "POSTED",
        type: "RECEIPT",
        updatedAt: new Date(),
      };

      const mockInventoryRepo = {
        createDraft: vi
          .fn()
          .mockResolvedValue({ ...mockMovement, status: "DRAFT" }),
        findById: vi
          .fn()
          .mockResolvedValue({ ...mockMovement, status: "DRAFT" }),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        post: vi.fn().mockResolvedValue(mockMovement),
      };

      const mockTxManager = {
        execute: vi.fn().mockImplementation(async (_ctx, operation) => {
          return operation({
            applicationContext: _ctx,
            auditWriter: {} as any,
            costRepository: mockCostRepo,
            inventoryMovementRepository: mockInventoryRepo,
            purchaseRepository: mockPurchaseRepo,
            salesOrderRepository: {} as any,
          });
        }),
      };

      const service = new ProcurementApplicationService({
        costRepository: mockCostRepo as any,
        purchases: mockPurchaseRepo as any,
        suppliers: repository as unknown as SupplierRepository,
        transactionManager: mockTxManager as any,
      });

      const result = await service.confirmPurchase(validContext, {
        purchaseId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("POSTED");
        expect(result.data.receiptMovementId).toBe(movementId);
      }
      expect(mockTxManager.execute).toHaveBeenCalled();
    });

    it("rejects purchase confirmation without PROCUREMENT:UPDATE permission", async () => {
      const repository = createMockRepository();
      const service = new ProcurementApplicationService({
        authorizationService: {
          authorize: vi
            .fn()
            .mockRejectedValue(new AuthorizationError("Denied")),
        },
        suppliers: repository as unknown as SupplierRepository,
      });

      const readOnlyContext: ApplicationExecutionContext = {
        ...validContext,
        permissions: [{ action: "READ", resource: "PROCUREMENT" }],
      };

      const result = await service.confirmPurchase(readOnlyContext, {
        purchaseId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN");
      }
    });
  });

  describe("Supplier Payment & Ledger operations", () => {
    const paymentId = "33333333-3333-4333-8333-333333333333";
    const ledgerEntryId = "66666666-6666-4666-8666-666666666666";

    function createMockPaymentRepo() {
      return {
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        getPaymentById: vi.fn(),
        listPayments: vi.fn(),
        recordPayment: vi.fn().mockImplementation(async (data: any) => ({
          amountMinor: data.amountMinor,
          createdAt: new Date("2026-09-28T00:00:00.000Z"),
          id: paymentId,
          idempotencyKey: data.idempotencyKey ?? null,
          notes: data.notes ?? null,
          organizationId: data.organizationId,
          paymentDate: data.paymentDate ?? new Date("2026-09-28T00:00:00.000Z"),
          paymentMethod: data.paymentMethod,
          purchaseId: data.purchaseId ?? null,
          reference: data.reference ?? null,
          supplierId: data.supplierId,
          updatedAt: new Date("2026-09-28T00:00:00.000Z"),
        })),
      };
    }

    function createMockLedgerRepo() {
      return {
        getSupplierBalance: vi.fn().mockResolvedValue({
          lastBillDate: new Date("2026-09-27T00:00:00.000Z"),
          lastPaymentDate: new Date("2026-09-28T00:00:00.000Z"),
          organizationId: orgId,
          outstandingBalanceMinor: 1500000n,
          supplierId,
          totalAdjustedMinor: 0n,
          totalBilledMinor: 2500000n,
          totalPaidMinor: 1000000n,
        }),
        listLedgerEntries: vi.fn().mockResolvedValue([
          {
            amountMinor: 1000000n,
            balanceAfterMinor: 1500000n,
            createdAt: new Date("2026-09-28T00:00:00.000Z"),
            direction: "DEBIT" as const,
            entryDate: new Date("2026-09-28T00:00:00.000Z"),
            entryType: "PAYMENT" as const,
            id: ledgerEntryId,
            notes: "Partial payment",
            organizationId: orgId,
            referenceId: paymentId,
            referenceType: "SUPPLIER_PAYMENT",
            supplierId,
          },
        ]),
        recordLedgerEntry: vi.fn().mockImplementation(async (data: any) => ({
          amountMinor: data.amountMinor,
          balanceAfterMinor: data.balanceAfterMinor,
          createdAt: new Date("2026-09-28T00:00:00.000Z"),
          direction: data.direction,
          entryDate: data.entryDate ?? new Date("2026-09-28T00:00:00.000Z"),
          entryType: data.entryType,
          id: ledgerEntryId,
          notes: data.notes ?? null,
          organizationId: data.organizationId,
          referenceId: data.referenceId ?? null,
          referenceType: data.referenceType ?? null,
          supplierId: data.supplierId,
        })),
      };
    }

    it("records a supplier payment and writes ledger entry", async () => {
      const mockSupplier = createMockSupplier();
      const mockSupplierRepo = createMockRepository();
      mockSupplierRepo.findById.mockResolvedValue(mockSupplier);

      const mockPaymentRepo = createMockPaymentRepo();
      const mockLedgerRepo = createMockLedgerRepo();

      const service = new ProcurementApplicationService({
        supplierLedger: mockLedgerRepo as any,
        supplierPayments: mockPaymentRepo as any,
        suppliers: mockSupplierRepo as any,
      });

      const result = await service.recordSupplierPayment(validContext, {
        amountMinor: "1000000",
        notes: "Advance payment",
        paymentMethod: "BANK_TRANSFER",
        reference: "TRX-998877",
        supplierId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.id).toBe(paymentId);
        expect(result.data.amountMinor).toBe("1000000");
        expect(result.data.paymentMethod).toBe("BANK_TRANSFER");
      }
      expect(mockPaymentRepo.recordPayment).toHaveBeenCalled();
      expect(mockLedgerRepo.recordLedgerEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 1000000n,
          direction: "DEBIT",
          entryType: "PAYMENT",
          organizationId: orgId,
          supplierId,
        }),
      );
    });

    it("rejects recording payment when user lacks PROCUREMENT:CREATE permission", async () => {
      const mockSupplierRepo = createMockRepository();
      const service = new ProcurementApplicationService({
        authorizationService: {
          authorize: vi
            .fn()
            .mockRejectedValue(new AuthorizationError("Denied")),
        },
        suppliers: mockSupplierRepo as any,
      });

      const readOnlyContext = {
        ...validContext,
        permissions: [
          { action: "READ" as const, resource: "PROCUREMENT" as const },
        ],
      };

      const result = await service.recordSupplierPayment(readOnlyContext, {
        amountMinor: "500000",
        paymentMethod: "CASH",
        supplierId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("FORBIDDEN");
      }
    });

    it("gets supplier balance summary scoped to organization", async () => {
      const mockSupplier = createMockSupplier();
      const mockSupplierRepo = createMockRepository();
      mockSupplierRepo.findById.mockResolvedValue(mockSupplier);

      const mockLedgerRepo = createMockLedgerRepo();

      const service = new ProcurementApplicationService({
        supplierLedger: mockLedgerRepo as any,
        suppliers: mockSupplierRepo as any,
      });

      const result = await service.getSupplierBalance(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.outstandingBalanceMinor).toBe("1500000");
        expect(result.data.totalBilledMinor).toBe("2500000");
        expect(result.data.totalPaidMinor).toBe("1000000");
      }
      expect(mockLedgerRepo.getSupplierBalance).toHaveBeenCalledWith(
        supplierId,
        orgId,
      );
    });

    it("lists supplier ledger entries with date and pagination parameters", async () => {
      const mockSupplier = createMockSupplier();
      const mockSupplierRepo = createMockRepository();
      mockSupplierRepo.findById.mockResolvedValue(mockSupplier);

      const mockLedgerRepo = createMockLedgerRepo();

      const service = new ProcurementApplicationService({
        supplierLedger: mockLedgerRepo as any,
        suppliers: mockSupplierRepo as any,
      });

      const result = await service.listSupplierLedger(validContext, {
        limit: 20,
        offset: 0,
        supplierId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.direction).toBe("DEBIT");
        expect(result.data[0]?.entryType).toBe("PAYMENT");
      }
      expect(mockLedgerRepo.listLedgerEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 0,
          organizationId: orgId,
          supplierId,
        }),
      );
    });

    it("lists supplier payments scoped to organization", async () => {
      const mockPaymentRepo = createMockPaymentRepo();
      mockPaymentRepo.listPayments.mockResolvedValue([
        {
          amountMinor: 1000000n,
          createdAt: new Date("2026-09-28T00:00:00.000Z"),
          id: paymentId,
          idempotencyKey: null,
          notes: null,
          organizationId: orgId,
          paymentDate: new Date("2026-09-28T00:00:00.000Z"),
          paymentMethod: "CASH" as const,
          purchaseId: null,
          reference: null,
          supplierId,
          updatedAt: new Date("2026-09-28T00:00:00.000Z"),
        },
      ]);

      const service = new ProcurementApplicationService({
        supplierPayments: mockPaymentRepo as any,
        suppliers: createMockRepository() as any,
      });

      const result = await service.listSupplierPayments(validContext, {
        supplierId,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe(paymentId);
      }
      expect(mockPaymentRepo.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          supplierId,
        }),
      );
    });
  });
});
