import { ConflictError } from "@senvo/domain";
import { describe, expect, it, vi } from "vitest";
import {
  PrismaSupplierLedgerRepository,
  PrismaSupplierPaymentRepository,
  type SupplierPaymentPrismaClient,
} from "./supplier-payment-repository.js";

class MockPrismaKnownError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

describe("PrismaSupplierPaymentRepository and PrismaSupplierLedgerRepository", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const supplierId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const purchaseId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const paymentId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  function createMockPrismaClient() {
    const supplierPayment = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    };
    const supplierLedgerEntry = {
      create: vi.fn(),
      findMany: vi.fn(),
    };
    const client = {
      supplierLedgerEntry:
        supplierLedgerEntry as unknown as SupplierPaymentPrismaClient["supplierLedgerEntry"],
      supplierPayment:
        supplierPayment as unknown as SupplierPaymentPrismaClient["supplierPayment"],
    };
    return { client, supplierLedgerEntry, supplierPayment };
  }

  describe("PrismaSupplierPaymentRepository", () => {
    it("records a supplier payment successfully", async () => {
      const { client, supplierPayment } = createMockPrismaClient();
      const repo = new PrismaSupplierPaymentRepository(client);

      const paymentDate = new Date("2026-09-15T12:00:00.000Z");
      supplierPayment.create.mockResolvedValue({
        amountMinor: 25_000n,
        createdAt: paymentDate,
        id: paymentId,
        idempotencyKey: "pay-idem-001",
        notes: "Bank transfer",
        organizationId: orgA,
        paymentDate,
        paymentMethod: "BANK_TRANSFER",
        purchaseId,
        reference: "TXN-12345",
        supplierId,
        updatedAt: paymentDate,
      });

      const result = await repo.recordPayment({
        amountMinor: 25_000n,
        idempotencyKey: "pay-idem-001",
        notes: "Bank transfer",
        organizationId: orgA,
        paymentDate,
        paymentMethod: "BANK_TRANSFER",
        purchaseId,
        reference: "TXN-12345",
        supplierId,
      });

      expect(result.amountMinor).toBe(25_000n);
      expect(result.paymentMethod).toBe("BANK_TRANSFER");
      expect(supplierPayment.create).toHaveBeenCalledWith({
        data: {
          amountMinor: 25_000n,
          idempotencyKey: "pay-idem-001",
          notes: "Bank transfer",
          organizationId: orgA,
          paymentDate,
          paymentMethod: "BANK_TRANSFER",
          purchaseId,
          reference: "TXN-12345",
          supplierId,
        },
      });
    });

    it("throws ConflictError on unique constraint violation (P2002)", async () => {
      const { client, supplierPayment } = createMockPrismaClient();
      const repo = new PrismaSupplierPaymentRepository(client);

      supplierPayment.create.mockRejectedValue(
        new MockPrismaKnownError("Unique constraint failed", "P2002"),
      );

      await expect(
        repo.recordPayment({
          amountMinor: 10_000n,
          idempotencyKey: "dup-key",
          organizationId: orgA,
          paymentDate: new Date(),
          paymentMethod: "CASH",
          supplierId,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("finds payment by id with organization isolation", async () => {
      const { client, supplierPayment } = createMockPrismaClient();
      const repo = new PrismaSupplierPaymentRepository(client);

      supplierPayment.findFirst.mockResolvedValue(null);

      const result = await repo.getPaymentById(paymentId, orgA);
      expect(result).toBeNull();
      expect(supplierPayment.findFirst).toHaveBeenCalledWith({
        where: { id: paymentId, organizationId: orgA },
      });
    });

    it("lists payments filtering by organization, supplier, and dates", async () => {
      const { client, supplierPayment } = createMockPrismaClient();
      const repo = new PrismaSupplierPaymentRepository(client);

      supplierPayment.findMany.mockResolvedValue([]);

      const from = new Date("2026-09-01T00:00:00.000Z");
      const to = new Date("2026-09-30T00:00:00.000Z");

      await repo.listPayments({
        from,
        limit: 10,
        offset: 0,
        organizationId: orgA,
        purchaseId,
        supplierId,
        to,
      });

      expect(supplierPayment.findMany).toHaveBeenCalledWith({
        orderBy: { paymentDate: "desc" },
        skip: 0,
        take: 10,
        where: {
          organizationId: orgA,
          paymentDate: { gte: from, lte: to },
          purchaseId,
          supplierId,
        },
      });
    });
  });

  describe("PrismaSupplierLedgerRepository", () => {
    it("records a ledger entry successfully", async () => {
      const { client, supplierLedgerEntry } = createMockPrismaClient();
      const repo = new PrismaSupplierLedgerRepository(client);

      const entryDate = new Date("2026-09-15T12:00:00.000Z");
      supplierLedgerEntry.create.mockResolvedValue({
        amountMinor: 50_000n,
        balanceAfterMinor: 50_000n,
        createdAt: entryDate,
        direction: "CREDIT",
        entryDate,
        entryType: "BILL",
        id: "entry-001",
        notes: "Bill for PO-001",
        organizationId: orgA,
        referenceId: purchaseId,
        referenceType: "PURCHASE",
        supplierId,
      });

      const entry = await repo.recordLedgerEntry({
        amountMinor: 50_000n,
        balanceAfterMinor: 50_000n,
        direction: "CREDIT",
        entryDate,
        entryType: "BILL",
        notes: "Bill for PO-001",
        organizationId: orgA,
        referenceId: purchaseId,
        referenceType: "PURCHASE",
        supplierId,
      });

      expect(entry.amountMinor).toBe(50_000n);
      expect(entry.entryType).toBe("BILL");
      expect(entry.direction).toBe("CREDIT");
    });

    it("calculates supplier balance from historical ledger entries", async () => {
      const { client, supplierLedgerEntry } = createMockPrismaClient();
      const repo = new PrismaSupplierLedgerRepository(client);

      const d1 = new Date("2026-09-01T10:00:00.000Z");
      const d2 = new Date("2026-09-15T10:00:00.000Z");

      supplierLedgerEntry.findMany.mockResolvedValue([
        {
          amountMinor: 100_000n,
          balanceAfterMinor: 100_000n,
          createdAt: d1,
          direction: "CREDIT",
          entryDate: d1,
          entryType: "BILL",
          id: "entry-1",
          notes: null,
          organizationId: orgA,
          referenceId: purchaseId,
          referenceType: "PURCHASE",
          supplierId,
        },
        {
          amountMinor: 40_000n,
          balanceAfterMinor: 60_000n,
          createdAt: d2,
          direction: "DEBIT",
          entryDate: d2,
          entryType: "PAYMENT",
          id: "entry-2",
          notes: null,
          organizationId: orgA,
          referenceId: paymentId,
          referenceType: "SUPPLIER_PAYMENT",
          supplierId,
        },
      ]);

      const balance = await repo.getSupplierBalance(supplierId, orgA);

      expect(balance.totalBilledMinor).toBe(100_000n);
      expect(balance.totalPaidMinor).toBe(40_000n);
      expect(balance.totalAdjustedMinor).toBe(0n);
      expect(balance.outstandingBalanceMinor).toBe(60_000n);
      expect(balance.lastBillDate).toEqual(d1);
      expect(balance.lastPaymentDate).toEqual(d2);
    });
  });
});
