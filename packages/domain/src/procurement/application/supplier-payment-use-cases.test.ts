import { describe, expect, it, vi } from "vitest";
import {
  getSupplierBalance,
  listSupplierLedger,
  listSupplierPayments,
  recordSupplierPayment,
  recordSupplierAdjustment,
} from "./supplier-payment-use-cases.js";
import { confirmPurchaseOrder } from "./purchase-use-cases.js";
import type {
  Purchase,
  PurchaseWithLines,
  Supplier,
  SupplierBalanceSummary,
  SupplierLedgerEntry,
  SupplierPayment,
} from "../domain/models.js";
import type { PurchaseRepository } from "../repositories/purchase-repository.js";
import type {
  SupplierLedgerRepository,
  SupplierPaymentRepository,
} from "../repositories/supplier-payment-repository.js";
import type { SupplierRepository } from "../repositories/supplier-repository.js";
import type { CostRepository } from "../repositories/cost-repository.js";
import type {
  InventoryMovementRepository,
  InventoryMovementPostingRepository,
} from "../../inventory/repositories/inventory-repositories.js";
import {
  BusinessRuleError,
  NotFoundError,
  ValidationApplicationError,
} from "../../errors.js";

const orgId = "10000000-0000-4000-8000-000000000001";
const otherOrgId = "90000000-0000-4000-8000-000000000009";
const supplierId = "20000000-0000-4000-8000-000000000002";
const purchaseId = "30000000-0000-4000-8000-000000000003";

describe("supplier payment and ledger use cases", () => {
  function createMockSupplier(overrides?: Partial<Supplier>): Supplier {
    return {
      address: "Dhaka",
      code: "SUP-01",
      contactPerson: "Rahim",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      email: "rahim@supplier.test",
      id: supplierId,
      name: "Babubazar Textiles",
      notes: null,
      organizationId: orgId,
      phone: "+8801700000000",
      status: "ACTIVE",
      updatedAt: new Date("2026-09-01T00:00:00Z"),
      ...overrides,
    };
  }

  function createMockPurchase(
    overrides?: Partial<PurchaseWithLines>,
  ): PurchaseWithLines {
    return {
      createdAt: new Date("2026-09-01T00:00:00Z"),
      destinationLocationId: "40000000-0000-4000-8000-000000000004",
      expectedDeliveryDate: null,
      id: purchaseId,
      idempotencyKey: null,
      lines: [
        {
          createdAt: new Date("2026-09-01T00:00:00Z"),
          id: "50000000-0000-4000-8000-000000000005",
          lineNumber: 1,
          notes: null,
          organizationId: orgId,
          productName: "Oxford Fabric",
          productVariantId: "60000000-0000-4000-8000-000000000006",
          purchaseId,
          quantity: 100,
          sku: "FAB-OXF",
          totalCostMinor: 50_000n,
          unitCostMinor: 500,
          updatedAt: new Date("2026-09-01T00:00:00Z"),
          variantName: "Blue",
        },
      ],
      notes: null,
      organizationId: orgId,
      purchaseDate: new Date("2026-09-01T00:00:00Z"),
      purchaseNumber: "PO-2026-001",
      receiptMovementId: null,
      status: "DRAFT",
      supplierId,
      totalCostMinor: 50_000n,
      updatedAt: new Date("2026-09-01T00:00:00Z"),
      ...overrides,
    };
  }

  function setupInMemoryRepositories() {
    const suppliers: Supplier[] = [createMockSupplier()];
    const purchases: PurchaseWithLines[] = [createMockPurchase()];
    const payments: SupplierPayment[] = [];
    const ledgerEntries: SupplierLedgerEntry[] = [];

    const supplierRepository: SupplierRepository = {
      create: vi.fn(),
      deactivate: vi.fn(),
      findByCode: vi.fn(),
      findById: vi.fn(async (id, oId) => {
        return (
          suppliers.find((s) => s.id === id && s.organizationId === oId) ?? null
        );
      }),
      list: vi.fn(async (filter) =>
        suppliers.filter((s) => s.organizationId === filter.organizationId),
      ),
      update: vi.fn(),
    };

    const purchaseRepository: PurchaseRepository = {
      create: vi.fn(),
      findById: vi.fn(async (id, oId) => {
        return (
          purchases.find((p) => p.id === id && p.organizationId === oId) ?? null
        );
      }),
      findByIdempotencyKey: vi.fn(),
      findByPurchaseNumber: vi.fn(),
      list: vi.fn(),
      update: vi.fn(async (record) => {
        const p = purchases.find(
          (x) =>
            x.id === record.id && x.organizationId === record.organizationId,
        );
        if (p) {
          if (record.status) p.status = record.status;
          if (record.receiptMovementId)
            p.receiptMovementId = record.receiptMovementId;
        }
        return p ?? null;
      }),
    };

    const supplierPaymentRepository: SupplierPaymentRepository = {
      findByIdempotencyKey: vi.fn(async (oId, key) => {
        return (
          payments.find(
            (p) => p.organizationId === oId && p.idempotencyKey === key,
          ) ?? null
        );
      }),
      getPaymentById: vi.fn(async (id, oId) => {
        return (
          payments.find((p) => p.id === id && p.organizationId === oId) ?? null
        );
      }),
      listPayments: vi.fn(async (filter) => {
        return payments.filter((p) => {
          if (p.organizationId !== filter.organizationId) return false;
          if (filter.supplierId && p.supplierId !== filter.supplierId)
            return false;
          if (filter.purchaseId && p.purchaseId !== filter.purchaseId)
            return false;
          return true;
        });
      }),
      recordPayment: vi.fn(async (record) => {
        const payment: SupplierPayment = {
          amountMinor: record.amountMinor,
          createdAt: new Date(),
          id:
            "70000000-0000-4000-8000-" +
            (payments.length + 1).toString().padStart(12, "0"),
          idempotencyKey: record.idempotencyKey ?? null,
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          paymentDate: record.paymentDate,
          paymentMethod: record.paymentMethod,
          purchaseId: record.purchaseId ?? null,
          reference: record.reference ?? null,
          supplierId: record.supplierId,
          updatedAt: new Date(),
        };
        payments.push(payment);
        return payment;
      }),
    };

    const supplierLedgerRepository: SupplierLedgerRepository = {
      getSupplierBalance: vi.fn(async (sId, oId) => {
        const entries = ledgerEntries.filter(
          (e) => e.supplierId === sId && e.organizationId === oId,
        );
        let totalBilled = 0n;
        let totalPaid = 0n;
        let totalAdjusted = 0n;
        let lastBillDate: Date | null = null;
        let lastPaymentDate: Date | null = null;

        for (const e of entries) {
          if (
            e.entryType === "BILL" ||
            (e.entryType === "OPENING_BALANCE" && e.direction === "CREDIT")
          ) {
            totalBilled += e.amountMinor;
            if (!lastBillDate || e.entryDate > lastBillDate)
              lastBillDate = e.entryDate;
          } else if (
            e.entryType === "PAYMENT" ||
            (e.entryType === "OPENING_BALANCE" && e.direction === "DEBIT")
          ) {
            totalPaid += e.amountMinor;
            if (!lastPaymentDate || e.entryDate > lastPaymentDate)
              lastPaymentDate = e.entryDate;
          } else if (e.entryType === "RETURN_CREDIT") {
            totalAdjusted += e.amountMinor;
          } else if (e.entryType === "ADJUSTMENT") {
            if (e.direction === "DEBIT") totalAdjusted += e.amountMinor;
            else totalAdjusted -= e.amountMinor;
          }
        }

        return {
          lastBillDate,
          lastPaymentDate,
          organizationId: oId,
          outstandingBalanceMinor: totalBilled - totalPaid - totalAdjusted,
          supplierId: sId,
          totalAdjustedMinor: totalAdjusted,
          totalBilledMinor: totalBilled,
          totalPaidMinor: totalPaid,
        };
      }),
      listLedgerEntries: vi.fn(async (filter) => {
        return ledgerEntries.filter((e) => {
          if (e.organizationId !== filter.organizationId) return false;
          if (e.supplierId !== filter.supplierId) return false;
          if (filter.entryType && e.entryType !== filter.entryType)
            return false;
          return true;
        });
      }),
      recordLedgerEntry: vi.fn(async (record) => {
        const entry: SupplierLedgerEntry = {
          amountMinor: record.amountMinor,
          balanceAfterMinor: record.balanceAfterMinor,
          createdAt: new Date(),
          direction: record.direction,
          entryDate: record.entryDate,
          entryType: record.entryType,
          id:
            "80000000-0000-4000-8000-" +
            (ledgerEntries.length + 1).toString().padStart(12, "0"),
          notes: record.notes ?? null,
          organizationId: record.organizationId,
          referenceId: record.referenceId ?? null,
          referenceType: record.referenceType ?? null,
          supplierId: record.supplierId,
        };
        ledgerEntries.push(entry);
        return entry;
      }),
    };

    return {
      ledgerEntries,
      payments,
      purchases,
      purchaseRepository,
      supplierLedgerRepository,
      supplierPaymentRepository,
      supplierRepository,
      suppliers,
    };
  }

  describe("recordSupplierPayment", () => {
    it("successfully records a payment, writes a DEBIT ledger entry, and updates balance", () => {
      const ctx = setupInMemoryRepositories();

      return recordSupplierPayment(
        {
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierPaymentRepository: ctx.supplierPaymentRepository,
          supplierRepository: ctx.supplierRepository,
        },
        {
          amountMinor: "20000",
          notes: "Partial payment for purchase",
          organizationId: orgId,
          paymentDate: new Date("2026-09-10T12:00:00Z"),
          paymentMethod: "BANK_TRANSFER",
          purchaseId,
          reference: "TXN-9988",
          supplierId,
        },
      ).then(({ payment, balance }) => {
        expect(payment.amountMinor).toBe(20_000n);
        expect(payment.paymentMethod).toBe("BANK_TRANSFER");
        expect(payment.purchaseId).toBe(purchaseId);
        expect(payment.reference).toBe("TXN-9988");

        // Ledger entry was created
        expect(ctx.ledgerEntries).toHaveLength(1);
        expect(ctx.ledgerEntries[0]?.entryType).toBe("PAYMENT");
        expect(ctx.ledgerEntries[0]?.direction).toBe("DEBIT");
        expect(ctx.ledgerEntries[0]?.amountMinor).toBe(20_000n);
        expect(ctx.ledgerEntries[0]?.referenceId).toBe(payment.id);

        // Balance was reduced from 0 to -20000 (prepayment)
        expect(balance?.totalPaidMinor).toBe(20_000n);
        expect(balance?.outstandingBalanceMinor).toBe(-20_000n);
      });
    });

    it("enforces organization isolation: rejects payment for supplier in another org", async () => {
      const ctx = setupInMemoryRepositories();

      await expect(
        recordSupplierPayment(
          {
            purchaseRepository: ctx.purchaseRepository,
            supplierLedgerRepository: ctx.supplierLedgerRepository,
            supplierPaymentRepository: ctx.supplierPaymentRepository,
            supplierRepository: ctx.supplierRepository,
          },
          {
            amountMinor: 5_000n,
            organizationId: otherOrgId,
            paymentMethod: "CASH",
            supplierId,
          },
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects payment if purchaseId belongs to another supplier", async () => {
      const ctx = setupInMemoryRepositories();
      const otherSupplierId = "99000000-0000-4000-8000-000000000099";
      ctx.suppliers.push(
        createMockSupplier({ id: otherSupplierId, code: "SUP-02" }),
      );

      await expect(
        recordSupplierPayment(
          {
            purchaseRepository: ctx.purchaseRepository,
            supplierLedgerRepository: ctx.supplierLedgerRepository,
            supplierPaymentRepository: ctx.supplierPaymentRepository,
            supplierRepository: ctx.supplierRepository,
          },
          {
            amountMinor: 5_000n,
            organizationId: orgId,
            paymentMethod: "CASH",
            purchaseId,
            supplierId: otherSupplierId,
          },
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("handles idempotency: returns existing payment and current balance without double posting", async () => {
      const ctx = setupInMemoryRepositories();

      const res1 = await recordSupplierPayment(
        {
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierPaymentRepository: ctx.supplierPaymentRepository,
          supplierRepository: ctx.supplierRepository,
        },
        {
          amountMinor: 15_000n,
          idempotencyKey: "idem-key-123",
          organizationId: orgId,
          paymentMethod: "CHEQUE",
          supplierId,
        },
      );

      expect(ctx.payments).toHaveLength(1);
      expect(ctx.ledgerEntries).toHaveLength(1);

      const res2 = await recordSupplierPayment(
        {
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierPaymentRepository: ctx.supplierPaymentRepository,
          supplierRepository: ctx.supplierRepository,
        },
        {
          amountMinor: 15_000n,
          idempotencyKey: "idem-key-123",
          organizationId: orgId,
          paymentMethod: "CHEQUE",
          supplierId,
        },
      );

      // Same payment returned, no duplicate recorded
      expect(res2.payment.id).toBe(res1.payment.id);
      expect(ctx.payments).toHaveLength(1);
      expect(ctx.ledgerEntries).toHaveLength(1);
    });

    it("rejects non-positive payment amount", async () => {
      const ctx = setupInMemoryRepositories();

      await expect(
        recordSupplierPayment(
          {
            purchaseRepository: ctx.purchaseRepository,
            supplierLedgerRepository: ctx.supplierLedgerRepository,
            supplierPaymentRepository: ctx.supplierPaymentRepository,
            supplierRepository: ctx.supplierRepository,
          },
          {
            amountMinor: 0n,
            organizationId: orgId,
            paymentMethod: "CASH",
            supplierId,
          },
        ),
      ).rejects.toThrow(ValidationApplicationError);
    });
  });

  describe("end-to-end purchase confirmation and payment workflow", () => {
    it("tracks supplier payable balance after purchase is confirmed, then reduces it upon payment", async () => {
      const ctx = setupInMemoryRepositories();

      const costRepository: CostRepository = {
        getCostState: vi.fn(async () => null),
        getSaleLineCostSnapshot: vi.fn(),
        getVariantOnHandQuantity: vi.fn(async () => 0),
        listCostEntries: vi.fn(),
        recordCostEntry: vi.fn(),
        recordSaleLineCostSnapshot: vi.fn(),
        upsertCostState: vi.fn(),
      };

      const inventoryMovementRepository = {
        createDraft: vi.fn(async (rec) => ({
          ...rec,
          createdAt: new Date(),
          id: "88888888-8888-4888-8888-888888888888",
          isReservationConsumption: false,
          isReversal: false,
          isReversed: false,
          lines: [],
          status: "DRAFT" as const,
          updatedAt: new Date(),
          version: 1,
        })),
        findById: vi.fn(async (id, oId) => ({
          destinationLocationId: "40000000-0000-4000-8000-000000000004",
          id,
          lines: [
            {
              createdAt: new Date(),
              id: "88888888-8888-4888-8888-888888888889",
              lineNumber: 1,
              movementId: id,
              note: null,
              organizationId: oId,
              productVariantId: "60000000-0000-4000-8000-000000000006",
              quantity: 100,
            },
          ],
          organizationId: oId,
          status: "DRAFT" as const,
          type: "RECEIPT" as const,
        })),
        findByIdempotencyKey: vi.fn(async () => null),
        post: vi.fn(async (rec) => ({
          id: rec.movementId,
          organizationId: rec.organizationId,
          postedAt: new Date(),
          status: "POSTED" as const,
        })),
      };

      // 1. Confirm purchase order (50,000 minor)
      await confirmPurchaseOrder(
        {
          costRepository,
          inventoryMovementRepository:
            inventoryMovementRepository as unknown as InventoryMovementRepository &
              InventoryMovementPostingRepository,
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
        },
        {
          organizationId: orgId,
          purchaseId,
        },
      );

      // Verify a BILL ledger entry was automatically recorded
      expect(ctx.ledgerEntries).toHaveLength(1);
      expect(ctx.ledgerEntries[0]?.entryType).toBe("BILL");
      expect(ctx.ledgerEntries[0]?.direction).toBe("CREDIT");
      expect(ctx.ledgerEntries[0]?.amountMinor).toBe(50_000n);

      // Check balance: 50,000 billed, 0 paid, 50,000 outstanding
      const balanceAfterBill = await getSupplierBalance(
        {
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierRepository: ctx.supplierRepository,
        },
        { organizationId: orgId, supplierId },
      );
      expect(balanceAfterBill.totalBilledMinor).toBe(50_000n);
      expect(balanceAfterBill.totalPaidMinor).toBe(0n);
      expect(balanceAfterBill.outstandingBalanceMinor).toBe(50_000n);

      // 2. Pay 30,000 against the supplier
      const payResult = await recordSupplierPayment(
        {
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierPaymentRepository: ctx.supplierPaymentRepository,
          supplierRepository: ctx.supplierRepository,
        },
        {
          amountMinor: 30_000n,
          organizationId: orgId,
          paymentMethod: "MOBILE_BANKING",
          purchaseId,
          reference: "BKASH-TRX-1",
          supplierId,
        },
      );

      // Outstanding balance is now 20,000
      expect(payResult.balance?.totalBilledMinor).toBe(50_000n);
      expect(payResult.balance?.totalPaidMinor).toBe(30_000n);
      expect(payResult.balance?.outstandingBalanceMinor).toBe(20_000n);

      // 3. Query ledger entries
      const ledger = await listSupplierLedger(
        {
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierRepository: ctx.supplierRepository,
        },
        { organizationId: orgId, supplierId },
      );
      expect(ledger).toHaveLength(2);

      // 4. Query payment history
      const payments = await listSupplierPayments(
        ctx.supplierPaymentRepository,
        {
          organizationId: orgId,
          supplierId,
        },
      );
      expect(payments).toHaveLength(1);
      expect(payments[0]?.amountMinor).toBe(30_000n);
    });

    it("records RETURN_CREDIT reducing payable balance after partial goods return", async () => {
      const ctx = setupInMemoryRepositories();
      const costRepository: CostRepository = {
        getCostState: vi.fn(async () => null),
        getSaleLineCostSnapshot: vi.fn(),
        getVariantOnHandQuantity: vi.fn(async () => 0),
        listCostEntries: vi.fn(),
        recordCostEntry: vi.fn(),
        recordSaleLineCostSnapshot: vi.fn(),
        upsertCostState: vi.fn(),
      };

      const inventoryMovementRepository = {
        createDraft: vi.fn(async (rec) => ({
          ...rec,
          createdAt: new Date(),
          id: "88888888-8888-4888-8888-888888888888",
          isReservationConsumption: false,
          isReversal: false,
          isReversed: false,
          lines: [],
          status: "DRAFT" as const,
          updatedAt: new Date(),
          version: 1,
        })),
        findById: vi.fn(async (id, oId) => ({
          destinationLocationId: "40000000-0000-4000-8000-000000000004",
          id,
          lines: [
            {
              createdAt: new Date(),
              id: "88888888-8888-4888-8888-888888888889",
              lineNumber: 1,
              movementId: id,
              note: null,
              organizationId: oId,
              productVariantId: "60000000-0000-4000-8000-000000000006",
              quantity: 100,
            },
          ],
          organizationId: oId,
          status: "DRAFT" as const,
          type: "RECEIPT" as const,
        })),
        findByIdempotencyKey: vi.fn(async () => null),
        post: vi.fn(async (rec) => ({
          id: rec.movementId,
          organizationId: rec.organizationId,
          postedAt: new Date(),
          status: "POSTED" as const,
        })),
      };

      await confirmPurchaseOrder(
        {
          costRepository,
          inventoryMovementRepository:
            inventoryMovementRepository as unknown as InventoryMovementRepository &
              InventoryMovementPostingRepository,
          purchaseRepository: ctx.purchaseRepository,
          supplierLedgerRepository: ctx.supplierLedgerRepository,
        },
        { organizationId: orgId, purchaseId },
      );

      // Return credit for defective goods (10,000 minor)
      const adjResult = await recordSupplierAdjustment(
        {
          supplierLedgerRepository: ctx.supplierLedgerRepository,
          supplierRepository: ctx.supplierRepository,
        },
        {
          amountMinor: 10_000n,
          entryType: "RETURN_CREDIT",
          notes: "Defective fabric returned to supplier",
          organizationId: orgId,
          purchaseId,
          referenceId: "RET-PO-001",
          supplierId,
        },
      );

      expect(adjResult.entry.entryType).toBe("RETURN_CREDIT");
      expect(adjResult.entry.direction).toBe("DEBIT");
      expect(adjResult.entry.amountMinor).toBe(10_000n);
      expect(adjResult.balance?.totalBilledMinor).toBe(50_000n);
      expect(adjResult.balance?.totalAdjustedMinor).toBe(10_000n);
      expect(adjResult.balance?.outstandingBalanceMinor).toBe(40_000n);
    });
  });
});
