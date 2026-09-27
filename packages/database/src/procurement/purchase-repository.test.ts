import { ConflictError, type PurchaseWithLines } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  PrismaPurchaseRepository,
  type PurchasePrismaClient,
} from "./purchase-repository.js";

class MockPrismaKnownError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("PrismaPurchaseRepository", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const purchaseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const supplierId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const locationId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const variantId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  function createMockPurchaseWithLines(
    overrides?: Partial<PurchaseWithLines>,
  ): PurchaseWithLines {
    return {
      createdAt: new Date("2026-09-27T00:00:00.000Z"),
      destinationLocationId: locationId,
      expectedDeliveryDate: new Date("2026-10-01T00:00:00.000Z"),
      id: purchaseId,
      idempotencyKey: "PO-REQ-001",
      lines: [
        {
          createdAt: new Date("2026-09-27T00:00:00.000Z"),
          id: "line-1",
          lineNumber: 1,
          notes: "100 pcs black 32",
          organizationId: orgA,
          productName: "Slim Fit Chino Pant",
          productVariantId: variantId,
          purchaseId,
          quantity: 100,
          sku: "CHINO-BLK-32",
          totalCostMinor: 5000000n, // 100 * 50,000 poisha (500 taka)
          unitCostMinor: 50000,
          updatedAt: new Date("2026-09-27T00:00:00.000Z"),
          variantName: "Black / 32",
        },
      ],
      notes: "First batch from Islam Garments",
      organizationId: orgA,
      purchaseDate: new Date("2026-09-27T00:00:00.000Z"),
      purchaseNumber: "PO-202609-0001",
      receiptMovementId: null,
      status: "DRAFT",
      supplierId,
      totalCostMinor: 5000000n,
      updatedAt: new Date("2026-09-27T00:00:00.000Z"),
      ...overrides,
    };
  }

  function createMockPrismaClient(): {
    client: PurchasePrismaClient;
    purchase: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  } {
    const purchase = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    };

    const client = {
      purchase: purchase as unknown as PurchasePrismaClient["purchase"],
    };

    return { client, purchase };
  }

  describe("create purchase", () => {
    it("creates a draft purchase with lines successfully", async () => {
      const mockRecord = createMockPurchaseWithLines();
      const { client, purchase } = createMockPrismaClient();
      purchase.create.mockResolvedValue(mockRecord);

      const repo = new PrismaPurchaseRepository(client);
      const result = await repo.create({
        destinationLocationId: locationId,
        expectedDeliveryDate: new Date("2026-10-01T00:00:00.000Z"),
        idempotencyKey: "PO-REQ-001",
        lines: [
          {
            lineNumber: 1,
            notes: "100 pcs black 32",
            productName: "Slim Fit Chino Pant",
            productVariantId: variantId,
            quantity: 100,
            sku: "CHINO-BLK-32",
            totalCostMinor: 5000000n,
            unitCostMinor: 50000,
            variantName: "Black / 32",
          },
        ],
        notes: "First batch from Islam Garments",
        organizationId: orgA,
        purchaseDate: new Date("2026-09-27T00:00:00.000Z"),
        purchaseNumber: "PO-202609-0001",
        status: "DRAFT",
        supplierId,
        totalCostMinor: 5000000n,
      });

      expect(purchase.create).toHaveBeenCalledWith({
        data: {
          destinationLocationId: locationId,
          expectedDeliveryDate: new Date("2026-10-01T00:00:00.000Z"),
          idempotencyKey: "PO-REQ-001",
          lines: {
            create: [
              {
                lineNumber: 1,
                notes: "100 pcs black 32",
                organizationId: orgA,
                productName: "Slim Fit Chino Pant",
                productVariantId: variantId,
                quantity: 100,
                sku: "CHINO-BLK-32",
                totalCostMinor: 5000000n,
                unitCostMinor: 50000,
                variantName: "Black / 32",
              },
            ],
          },
          notes: "First batch from Islam Garments",
          organizationId: orgA,
          purchaseDate: new Date("2026-09-27T00:00:00.000Z"),
          purchaseNumber: "PO-202609-0001",
          receiptMovementId: null,
          status: "DRAFT",
          supplierId,
          totalCostMinor: 5000000n,
        },
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
          },
        },
      });

      expect(result.id).toBe(purchaseId);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]?.sku).toBe("CHINO-BLK-32");
    });

    it("throws ConflictError on duplicate purchase number or idempotency key", async () => {
      const { client, purchase } = createMockPrismaClient();
      purchase.create.mockRejectedValue(
        new MockPrismaKnownError("Unique constraint failed", "P2002"),
      );

      const repo = new PrismaPurchaseRepository(client);
      await expect(
        repo.create({
          destinationLocationId: locationId,
          organizationId: orgA,
          purchaseDate: new Date(),
          purchaseNumber: "PO-202609-0001",
          supplierId,
          totalCostMinor: 5000000n,
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("tenant isolation", () => {
    it("returns purchase only when organizationId matches (findById)", async () => {
      const mockRecord = createMockPurchaseWithLines();
      const { client, purchase } = createMockPrismaClient();
      purchase.findFirst.mockResolvedValue(mockRecord);

      const repo = new PrismaPurchaseRepository(client);
      const resultOrgA = await repo.findById(purchaseId, orgA);

      expect(purchase.findFirst).toHaveBeenCalledWith({
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
          },
        },
        where: { id: purchaseId, organizationId: orgA },
      });
      expect(resultOrgA?.id).toBe(purchaseId);
    });

    it("prevents finding purchase belonging to another organization", async () => {
      const { client, purchase } = createMockPrismaClient();
      purchase.findFirst.mockResolvedValue(null);

      const repo = new PrismaPurchaseRepository(client);
      const resultOrgB = await repo.findById(purchaseId, orgB);

      expect(purchase.findFirst).toHaveBeenCalledWith({
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
          },
        },
        where: { id: purchaseId, organizationId: orgB },
      });
      expect(resultOrgB).toBeNull();
    });

    it("scopes findByPurchaseNumber to organizationId", async () => {
      const mockRecord = createMockPurchaseWithLines();
      const { client, purchase } = createMockPrismaClient();
      purchase.findUnique.mockResolvedValue(mockRecord);

      const repo = new PrismaPurchaseRepository(client);
      await repo.findByPurchaseNumber(orgA, "PO-202609-0001");

      expect(purchase.findUnique).toHaveBeenCalledWith({
        include: {
          lines: {
            orderBy: { lineNumber: "asc" },
          },
        },
        where: {
          organizationId_purchaseNumber: {
            organizationId: orgA,
            purchaseNumber: "PO-202609-0001",
          },
        },
      });
    });

    it("scopes list to organizationId and applies filters", async () => {
      const mockRecord = createMockPurchaseWithLines();
      const { client, purchase } = createMockPrismaClient();
      purchase.findMany.mockResolvedValue([mockRecord]);

      const repo = new PrismaPurchaseRepository(client);
      const results = await repo.list({
        limit: 10,
        offset: 0,
        organizationId: orgA,
        status: "DRAFT",
        supplierId,
      });

      expect(purchase.findMany).toHaveBeenCalledWith({
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        skip: 0,
        take: 10,
        where: {
          organizationId: orgA,
          status: "DRAFT",
          supplierId,
        },
      });
      expect(results).toHaveLength(1);
    });
  });

  describe("update purchase", () => {
    it("updates purchase fields scoped by organizationId", async () => {
      const mockRecord = createMockPurchaseWithLines({ status: "POSTED" });
      const { client, purchase } = createMockPrismaClient();
      purchase.update.mockResolvedValue(mockRecord);

      const repo = new PrismaPurchaseRepository(client);
      const updated = await repo.update({
        id: purchaseId,
        organizationId: orgA,
        status: "POSTED",
      });

      expect(purchase.update).toHaveBeenCalledWith({
        data: { status: "POSTED" },
        where: {
          id_organizationId: {
            id: purchaseId,
            organizationId: orgA,
          },
        },
      });
      expect(updated?.status).toBe("POSTED");
    });

    it("returns null when record does not exist during update", async () => {
      const { client, purchase } = createMockPrismaClient();
      purchase.update.mockRejectedValue(
        new MockPrismaKnownError("Record to update not found", "P2025"),
      );

      const repo = new PrismaPurchaseRepository(client);
      const result = await repo.update({
        id: "non-existent-id",
        organizationId: orgA,
        status: "POSTED",
      });

      expect(result).toBeNull();
    });
  });
});
