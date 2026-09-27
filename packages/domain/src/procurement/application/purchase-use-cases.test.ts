/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import {
  BusinessRuleError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";
import type { InventoryMovement } from "../../inventory/domain/models.js";
import type {
  InventoryMovementPostingRepository,
  InventoryMovementRepository,
} from "../../inventory/repositories/inventory-repositories.js";
import type {
  Purchase,
  PurchaseWithLines,
  VariantCostState,
} from "../domain/models.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";
import {
  confirmPurchaseOrder,
  createPurchaseDraftRecord,
  getPurchaseById,
  listPurchaseRecords,
} from "./purchase-use-cases.js";

describe("Purchase Domain Use Cases", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const otherOrgId = "22222222-2222-4222-8222-222222222222";
  const supplierId = "33333333-3333-4333-8333-333333333333";
  const locationId = "44444444-4444-4444-8444-444444444444";
  const variantId1 = "55555555-5555-4555-8555-555555555555";
  const purchaseId = "77777777-7777-4777-8777-777777777777";
  const movementId = "88888888-8888-4888-8888-888888888888";

  function createMockPurchase(
    overrides?: Partial<PurchaseWithLines>,
  ): PurchaseWithLines {
    return {
      createdAt: new Date("2026-09-27T00:00:00.000Z"),
      destinationLocationId: locationId,
      expectedDeliveryDate: null,
      id: purchaseId,
      idempotencyKey: null,
      lines: [
        {
          createdAt: new Date("2026-09-27T00:00:00.000Z"),
          id: "line-1",
          lineNumber: 1,
          notes: null,
          organizationId: orgId,
          productName: "Men's Classic Shirt",
          productVariantId: variantId1,
          purchaseId,
          quantity: 100,
          sku: "SHIRT-BLK-M",
          totalCostMinor: 5000000n, // 100 * 50,000 poisha (500 taka)
          unitCostMinor: 50000,
          updatedAt: new Date("2026-09-27T00:00:00.000Z"),
          variantName: "Black / M",
        },
      ],
      notes: "First batch from supplier",
      organizationId: orgId,
      purchaseDate: new Date("2026-09-27T00:00:00.000Z"),
      purchaseNumber: "PO-20260927-001",
      receiptMovementId: null,
      status: "DRAFT",
      supplierId,
      totalCostMinor: 5000000n,
      updatedAt: new Date("2026-09-27T00:00:00.000Z"),
      ...overrides,
    };
  }

  function createMockMovement(
    overrides?: Partial<InventoryMovement>,
  ): InventoryMovement {
    return {
      consumesReservationId: null,
      createdAt: new Date("2026-09-27T00:00:00.000Z"),
      destinationLocationId: locationId,
      id: movementId,
      idempotencyKey: `receipt:purchase:${purchaseId}`,
      isReservationConsumption: false,
      isReversal: false,
      isReversed: false,
      lines: [
        {
          createdAt: new Date("2026-09-27T00:00:00.000Z"),
          id: "mov-line-1",
          lineNumber: 1,
          movementId,
          note: null,
          organizationId: orgId,
          productVariantId: variantId1,
          quantity: 100,
        },
      ],
      movementNumber: `REC-PO-20260927-001`,
      note: "Purchase receipt",
      occurredAt: new Date("2026-09-27T00:00:00.000Z"),
      organizationId: orgId,
      postedAt: new Date("2026-09-27T00:00:00.000Z"),
      referenceId: purchaseId,
      referenceType: "PURCHASE",
      reversalReason: null,
      reversedByMovementId: null,
      reversesMovementId: null,
      sourceLocationId: null,
      status: "POSTED",
      type: "RECEIPT",
      updatedAt: new Date("2026-09-27T00:00:00.000Z"),
      version: 1,
      ...overrides,
    };
  }

  function createMockRepositories() {
    const purchaseRepo: PurchaseRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      findByPurchaseNumber: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
    };

    const costRepo: CostRepository = {
      getCostState: vi.fn(),
      getSaleLineCostSnapshot: vi.fn(),
      getVariantOnHandQuantity: vi.fn(),
      listCostEntries: vi.fn(),
      recordCostEntry: vi.fn(),
      recordSaleLineCostSnapshot: vi.fn(),
      upsertCostState: vi.fn(),
    };

    const inventoryRepo: Pick<
      InventoryMovementRepository,
      "createDraft" | "findByIdempotencyKey"
    > &
      InventoryMovementPostingRepository = {
      createDraft: vi.fn(),
      findById: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      post: vi.fn(),
    };

    return { costRepo, inventoryRepo, purchaseRepo };
  }

  describe("createPurchaseDraftRecord", () => {
    it("creates a draft purchase order with lines and total cost", async () => {
      const { purchaseRepo } = createMockRepositories();
      const mockCreated = createMockPurchase();
      vi.mocked(purchaseRepo.create).mockResolvedValue(mockCreated);

      const result = await createPurchaseDraftRecord(purchaseRepo, {
        destinationLocationId: locationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Men's Classic Shirt",
            productVariantId: variantId1,
            quantity: 100,
            sku: "SHIRT-BLK-M",
            unitCostMinor: 50000,
          },
        ],
        notes: "First batch from supplier",
        organizationId: orgId,
        purchaseNumber: "PO-20260927-001",
        supplierId,
      });

      expect(purchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationLocationId: locationId,
          organizationId: orgId,
          purchaseNumber: "PO-20260927-001",
          status: "DRAFT",
          supplierId,
          totalCostMinor: 5000000n,
        }),
      );
      expect(result.id).toBe(purchaseId);
      expect(result.status).toBe("DRAFT");
    });

    it("generates a purchase number when not provided", async () => {
      const { purchaseRepo } = createMockRepositories();
      vi.mocked(purchaseRepo.create).mockResolvedValue(createMockPurchase());

      await createPurchaseDraftRecord(purchaseRepo, {
        destinationLocationId: locationId,
        lines: [
          {
            lineNumber: 1,
            productName: "Men's Classic Shirt",
            productVariantId: variantId1,
            quantity: 50,
            sku: "SHIRT-BLK-M",
            unitCostMinor: 50000,
          },
        ],
        organizationId: orgId,
        supplierId,
      });

      expect(purchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseNumber: expect.stringMatching(/^PO-/) as unknown as string,
        }),
      );
    });

    it("returns existing purchase if idempotency key matches", async () => {
      const { purchaseRepo } = createMockRepositories();
      const existing = createMockPurchase({ idempotencyKey: "idem-key-1" });
      vi.mocked(purchaseRepo.findByIdempotencyKey).mockResolvedValue(existing);

      const result = await createPurchaseDraftRecord(purchaseRepo, {
        destinationLocationId: locationId,
        idempotencyKey: "idem-key-1",
        lines: [
          {
            lineNumber: 1,
            productName: "Men's Classic Shirt",
            productVariantId: variantId1,
            quantity: 100,
            sku: "SHIRT-BLK-M",
            unitCostMinor: 50000,
          },
        ],
        organizationId: orgId,
        supplierId,
      });

      expect(result).toBe(existing);
      expect(purchaseRepo.create).not.toHaveBeenCalled();
    });

    it("rejects duplicate variants in the same purchase order", async () => {
      const { purchaseRepo } = createMockRepositories();

      await expect(
        createPurchaseDraftRecord(purchaseRepo, {
          destinationLocationId: locationId,
          lines: [
            {
              lineNumber: 1,
              productName: "Shirt M",
              productVariantId: variantId1,
              quantity: 10,
              sku: "SHIRT-M",
              unitCostMinor: 50000,
            },
            {
              lineNumber: 2,
              productName: "Shirt M Duplicate",
              productVariantId: variantId1,
              quantity: 20,
              sku: "SHIRT-M",
              unitCostMinor: 50000,
            },
          ],
          organizationId: orgId,
          supplierId,
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects empty lines list", async () => {
      const { purchaseRepo } = createMockRepositories();

      await expect(
        createPurchaseDraftRecord(purchaseRepo, {
          destinationLocationId: locationId,
          lines: [],
          organizationId: orgId,
          supplierId,
        }),
      ).rejects.toThrow(ValidationApplicationError);
    });
  });

  describe("getPurchaseById and listPurchaseRecords", () => {
    it("returns purchase by id when found", async () => {
      const { purchaseRepo } = createMockRepositories();
      const mockPurchase = createMockPurchase();
      vi.mocked(purchaseRepo.findById).mockResolvedValue(mockPurchase);

      const result = await getPurchaseById(purchaseRepo, {
        organizationId: orgId,
        purchaseId,
      });

      expect(result.id).toBe(purchaseId);
      expect(purchaseRepo.findById).toHaveBeenCalledWith(purchaseId, orgId);
    });

    it("throws NotFoundError when purchase does not exist", async () => {
      const { purchaseRepo } = createMockRepositories();
      vi.mocked(purchaseRepo.findById).mockResolvedValue(null);

      await expect(
        getPurchaseById(purchaseRepo, {
          organizationId: orgId,
          purchaseId,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("lists purchases with organization scoping", async () => {
      const { purchaseRepo } = createMockRepositories();
      const mockList: Purchase[] = [createMockPurchase()];
      vi.mocked(purchaseRepo.list).mockResolvedValue(mockList);

      const result = await listPurchaseRecords(purchaseRepo, {
        organizationId: orgId,
        status: "DRAFT",
      });

      expect(result).toHaveLength(1);
      expect(purchaseRepo.list).toHaveBeenCalledWith({
        organizationId: orgId,
        status: "DRAFT",
      });
    });
  });

  describe("confirmPurchaseOrder", () => {
    it("confirms purchase atomically: creates receipt movement, posts movement, updates moving average cost, records cost ledger entry, and marks purchase POSTED", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const draftPurchase = createMockPurchase({ status: "DRAFT" });

      const mockMovement = createMockMovement({
        movementNumber: `REC-${draftPurchase.purchaseNumber}`,
        note: `Purchase receipt for ${draftPurchase.purchaseNumber}`,
      });

      vi.mocked(purchaseRepo.findById)
        .mockResolvedValueOnce(draftPurchase) // initial lookup
        .mockResolvedValueOnce({
          ...draftPurchase,
          receiptMovementId: movementId,
          status: "POSTED",
        }); // final lookup

      const draftMovement: InventoryMovement = {
        ...mockMovement,
        status: "DRAFT",
      };
      vi.mocked(inventoryRepo.createDraft).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.findById).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.post).mockResolvedValue(mockMovement);

      // Suppose prior stock was 20 pcs @ 500 taka (50,000 poisha)
      // Now receiving 100 pcs @ 600 taka (60,000 poisha)
      draftPurchase.lines[0]!.unitCostMinor = 60000;
      draftPurchase.lines[0]!.totalCostMinor = 6000000n;

      // On-hand after receipt movement is posted: 120 pcs
      vi.mocked(costRepo.getVariantOnHandQuantity).mockResolvedValue(120);

      const existingCostState: VariantCostState = {
        averageCostMinor: 50000,
        costUnknownReason: null,
        createdAt: new Date(),
        id: "cs-1",
        inventoryValueMinor: 1000000n, // 20 * 50,000
        isCostKnown: true,
        lastCostEventAt: new Date(),
        organizationId: orgId,
        productVariantId: variantId1,
        updatedAt: new Date(),
        version: 1,
      };
      vi.mocked(costRepo.getCostState).mockResolvedValue(existingCostState);

      const confirmed = await confirmPurchaseOrder(
        {
          costRepository: costRepo,
          inventoryMovementRepository: inventoryRepo,
          purchaseRepository: purchaseRepo,
        },
        { organizationId: orgId, purchaseId },
      );

      // Verify movement was created as RECEIPT referencing PURCHASE
      expect(inventoryRepo.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationLocationId: locationId,
          referenceId: purchaseId,
          referenceType: "PURCHASE",
          type: "RECEIPT",
        }),
        expect.any(String),
      );

      // Verify movement was posted
      expect(inventoryRepo.post).toHaveBeenCalledWith({
        movementId,
        organizationId: orgId,
      });

      // Verify cost ledger entry recorded with moving average values
      // (1,000,000 + 6,000,000) / 120 = 7,000,000 / 120 = 58333.33 => 58333 poisha
      expect(costRepo.recordCostEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          afterAverageCostMinor: 58333,
          afterQuantity: 120,
          afterValueMinor: 7000000n,
          beforeAverageCostMinor: 50000,
          beforeQuantity: 20,
          beforeValueMinor: 1000000n,
          eventType: "PURCHASE_RECEIPT",
          organizationId: orgId,
          productVariantId: variantId1,
          quantityChange: 100,
          sourceMovementId: movementId,
          sourcePurchaseId: purchaseId,
        }),
      );

      // Verify variant cost state updated
      expect(costRepo.upsertCostState).toHaveBeenCalledWith(
        expect.objectContaining({
          averageCostMinor: 58333,
          expectedVersion: 1,
          inventoryValueMinor: 7000000n,
          isCostKnown: true,
          organizationId: orgId,
          productVariantId: variantId1,
        }),
      );

      // Verify purchase updated to POSTED with receiptMovementId
      expect(purchaseRepo.update).toHaveBeenCalledWith({
        id: purchaseId,
        organizationId: orgId,
        receiptMovementId: movementId,
        status: "POSTED",
      });

      expect(confirmed.status).toBe("POSTED");
      expect(confirmed.receiptMovementId).toBe(movementId);
    });

    it("preserves isCostKnown=false and costUnknownReason when opening stock cost is unknown", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const draftPurchase = createMockPurchase({ status: "DRAFT" });

      const mockMovement = createMockMovement({
        movementNumber: `REC-${draftPurchase.purchaseNumber}`,
      });

      const draftMovement: InventoryMovement = {
        ...mockMovement,
        status: "DRAFT",
      };

      vi.mocked(purchaseRepo.findById)
        .mockResolvedValueOnce(draftPurchase)
        .mockResolvedValueOnce({
          ...draftPurchase,
          receiptMovementId: movementId,
          status: "POSTED",
        });

      vi.mocked(inventoryRepo.createDraft).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.findById).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.post).mockResolvedValue(mockMovement);

      // 10 units on hand with unknown opening cost; receive 100 units @ 500 taka (50000 poisha)
      // Total on hand after receipt: 110 units
      vi.mocked(costRepo.getVariantOnHandQuantity).mockResolvedValue(110);
      vi.mocked(costRepo.getCostState).mockResolvedValue(null);

      await confirmPurchaseOrder(
        {
          costRepository: costRepo,
          inventoryMovementRepository: inventoryRepo,
          purchaseRepository: purchaseRepo,
        },
        { organizationId: orgId, purchaseId },
      );

      // Receipt does NOT make unknown opening stock known; adds only received cost (5,000,000 poisha)
      expect(costRepo.recordCostEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          afterAverageCostMinor: null,
          afterQuantity: 110,
          afterValueMinor: 5000000n, // only received 100 * 50,000 poisha
          beforeAverageCostMinor: null,
          beforeQuantity: 10,
          beforeValueMinor: 0n,
          eventType: "PURCHASE_RECEIPT",
          valueChangeMinor: 5000000n,
        }),
      );

      expect(costRepo.upsertCostState).toHaveBeenCalledWith(
        expect.objectContaining({
          averageCostMinor: null,
          costUnknownReason: "OPENING_STOCK_UNKNOWN",
          inventoryValueMinor: 5000000n,
          isCostKnown: false,
        }),
      );
    });

    it("establishes known unit cost baseline when variant had zero existing stock on hand", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const draftPurchase = createMockPurchase({ status: "DRAFT" });

      const mockMovement = createMockMovement({
        movementNumber: `REC-${draftPurchase.purchaseNumber}`,
      });

      const draftMovement: InventoryMovement = {
        ...mockMovement,
        status: "DRAFT",
      };

      vi.mocked(purchaseRepo.findById)
        .mockResolvedValueOnce(draftPurchase)
        .mockResolvedValueOnce({
          ...draftPurchase,
          receiptMovementId: movementId,
          status: "POSTED",
        });

      vi.mocked(inventoryRepo.createDraft).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.findById).mockResolvedValue(draftMovement);
      vi.mocked(inventoryRepo.post).mockResolvedValue(mockMovement);

      // 0 units on hand prior to receipt; receive 100 units @ 500 taka (50000 poisha)
      // Total on hand after receipt: 100 units
      vi.mocked(costRepo.getVariantOnHandQuantity).mockResolvedValue(100);
      vi.mocked(costRepo.getCostState).mockResolvedValue(null);

      await confirmPurchaseOrder(
        {
          costRepository: costRepo,
          inventoryMovementRepository: inventoryRepo,
          purchaseRepository: purchaseRepo,
        },
        { organizationId: orgId, purchaseId },
      );

      // Receipt establishes known unit cost (50,000 poisha) since there was no unknown prior stock
      expect(costRepo.recordCostEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          afterAverageCostMinor: 50000,
          afterQuantity: 100,
          afterValueMinor: 5000000n,
          beforeAverageCostMinor: null,
          beforeQuantity: 0,
          beforeValueMinor: 0n,
          eventType: "PURCHASE_RECEIPT",
          valueChangeMinor: 5000000n,
        }),
      );

      expect(costRepo.upsertCostState).toHaveBeenCalledWith(
        expect.objectContaining({
          averageCostMinor: 50000,
          costUnknownReason: null,
          inventoryValueMinor: 5000000n,
          isCostKnown: true,
        }),
      );
    });

    it("is idempotent: returns already POSTED purchase without re-executing inventory or costing", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const alreadyPosted = createMockPurchase({
        receiptMovementId: movementId,
        status: "POSTED",
      });
      vi.mocked(purchaseRepo.findById).mockResolvedValue(alreadyPosted);

      const result = await confirmPurchaseOrder(
        {
          costRepository: costRepo,
          inventoryMovementRepository: inventoryRepo,
          purchaseRepository: purchaseRepo,
        },
        { organizationId: orgId, purchaseId },
      );

      expect(result).toBe(alreadyPosted);
      expect(inventoryRepo.createDraft).not.toHaveBeenCalled();
      expect(costRepo.recordCostEntry).not.toHaveBeenCalled();
      expect(purchaseRepo.update).not.toHaveBeenCalled();
    });

    it("rejects confirmation if purchase is CANCELLED", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const cancelledPurchase = createMockPurchase({ status: "CANCELLED" });
      vi.mocked(purchaseRepo.findById).mockResolvedValue(cancelledPurchase);

      await expect(
        confirmPurchaseOrder(
          {
            costRepository: costRepo,
            inventoryMovementRepository: inventoryRepo,
            purchaseRepository: purchaseRepo,
          },
          { organizationId: orgId, purchaseId },
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects confirmation if purchase has no lines", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      const emptyPurchase = createMockPurchase({ lines: [] });
      vi.mocked(purchaseRepo.findById).mockResolvedValue(emptyPurchase);

      await expect(
        confirmPurchaseOrder(
          {
            costRepository: costRepo,
            inventoryMovementRepository: inventoryRepo,
            purchaseRepository: purchaseRepo,
          },
          { organizationId: orgId, purchaseId },
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects confirmation if purchase does not exist or org mismatch", async () => {
      const { costRepo, inventoryRepo, purchaseRepo } =
        createMockRepositories();
      vi.mocked(purchaseRepo.findById).mockResolvedValue(null);

      await expect(
        confirmPurchaseOrder(
          {
            costRepository: costRepo,
            inventoryMovementRepository: inventoryRepo,
            purchaseRepository: purchaseRepo,
          },
          { organizationId: otherOrgId, purchaseId },
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
