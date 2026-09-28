import { describe, expect, it } from "vitest";
import {
  calculateSupplierBalance,
  calculateSupplierBalanceFromEntries,
  createSupplierLedgerEntry,
  createSupplierPayment,
} from "./supplier-ledger-rules.js";
import type { SupplierLedgerEntry } from "./models.js";
import { BusinessRuleError, ValidationApplicationError } from "../../errors.js";

const orgId = "10000000-0000-4000-8000-000000000001";
const supplierId = "20000000-0000-4000-8000-000000000002";
const purchaseId = "30000000-0000-4000-8000-000000000003";

describe("supplier ledger domain rules", () => {
  describe("calculateSupplierBalance with totals", () => {
    it("calculates outstanding balance: totalBilled - totalPaid - totalAdjusted", () => {
      const balance = calculateSupplierBalance({
        totalAdjustedMinor: 1_000n,
        totalBilledMinor: 10_000n,
        totalPaidMinor: 4_000n,
      });
      expect(balance).toBe(5_000n);
    });

    it("defaults totalAdjustedMinor to 0n when omitted", () => {
      const balance = calculateSupplierBalance({
        totalBilledMinor: 8_500n,
        totalPaidMinor: 3_500n,
      });
      expect(balance).toBe(5_000n);
    });

    it("handles large BigInt numbers beyond JavaScript safe integer range without precision loss", () => {
      const hugeBilled = 90_000_000_000_000_000_000n;
      const hugePaid = 35_000_000_000_000_000_000n;
      const hugeAdjusted = 5_000_000_000_000_000_000n;

      const balance = calculateSupplierBalance({
        totalAdjustedMinor: hugeAdjusted,
        totalBilledMinor: hugeBilled,
        totalPaidMinor: hugePaid,
      });
      expect(balance).toBe(50_000_000_000_000_000_000n);
    });

    it("rejects negative totalBilledMinor or totalPaidMinor", () => {
      expect(() =>
        calculateSupplierBalance({
          totalBilledMinor: -1n,
          totalPaidMinor: 100n,
        }),
      ).toThrow(ValidationApplicationError);

      expect(() =>
        calculateSupplierBalance({
          totalBilledMinor: 100n,
          totalPaidMinor: -1n,
        }),
      ).toThrow(ValidationApplicationError);
    });
  });

  describe("calculateSupplierBalanceFromEntries", () => {
    it("calculates balance with multiple bills and payments", () => {
      const entries: SupplierLedgerEntry[] = [
        createSupplierLedgerEntry({
          amountMinor: 50_000n,
          currentBalanceMinor: 0n,
          entryDate: new Date("2026-09-01T10:00:00Z"),
          entryType: "BILL",
          organizationId: orgId,
          supplierId,
        }),
        createSupplierLedgerEntry({
          amountMinor: 30_000n,
          currentBalanceMinor: 50_000n,
          entryDate: new Date("2026-09-05T10:00:00Z"),
          entryType: "BILL",
          organizationId: orgId,
          supplierId,
        }),
        createSupplierLedgerEntry({
          amountMinor: 20_000n,
          currentBalanceMinor: 80_000n,
          entryDate: new Date("2026-09-10T10:00:00Z"),
          entryType: "PAYMENT",
          organizationId: orgId,
          supplierId,
        }),
      ];

      const summary = calculateSupplierBalanceFromEntries({
        entries,
        organizationId: orgId,
        supplierId,
      });

      expect(summary.totalBilledMinor).toBe(80_000n);
      expect(summary.totalPaidMinor).toBe(20_000n);
      expect(summary.totalAdjustedMinor).toBe(0n);
      expect(summary.outstandingBalanceMinor).toBe(60_000n);
      expect(summary.lastBillDate).toEqual(new Date("2026-09-05T10:00:00Z"));
      expect(summary.lastPaymentDate).toEqual(new Date("2026-09-10T10:00:00Z"));
    });

    it("verifies partial payments incrementally reduce outstanding balance", () => {
      const e1 = createSupplierLedgerEntry({
        amountMinor: 10_000n,
        currentBalanceMinor: 0n,
        entryType: "BILL",
        organizationId: orgId,
        supplierId,
      });
      const e2 = createSupplierLedgerEntry({
        amountMinor: 3_000n,
        currentBalanceMinor: e1.balanceAfterMinor,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(e2.balanceAfterMinor).toBe(7_000n);

      const e3 = createSupplierLedgerEntry({
        amountMinor: 4_000n,
        currentBalanceMinor: e2.balanceAfterMinor,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(e3.balanceAfterMinor).toBe(3_000n);

      const e4 = createSupplierLedgerEntry({
        amountMinor: 3_000n,
        currentBalanceMinor: e3.balanceAfterMinor,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(e4.balanceAfterMinor).toBe(0n);

      const summary = calculateSupplierBalance({
        entries: [e1, e2, e3, e4],
        organizationId: orgId,
        supplierId,
      });
      expect(summary.outstandingBalanceMinor).toBe(0n);
      expect(summary.totalBilledMinor).toBe(10_000n);
      expect(summary.totalPaidMinor).toBe(10_000n);
    });

    it("verifies return credit decreases liability", () => {
      const bill = createSupplierLedgerEntry({
        amountMinor: 20_000n,
        currentBalanceMinor: 0n,
        entryType: "BILL",
        organizationId: orgId,
        supplierId,
      });
      const returnCredit = createSupplierLedgerEntry({
        amountMinor: 5_000n,
        currentBalanceMinor: bill.balanceAfterMinor,
        entryType: "RETURN_CREDIT",
        organizationId: orgId,
        supplierId,
      });
      expect(returnCredit.direction).toBe("DEBIT");
      expect(returnCredit.balanceAfterMinor).toBe(15_000n);

      const summary = calculateSupplierBalanceFromEntries({
        entries: [bill, returnCredit],
        organizationId: orgId,
        supplierId,
      });
      expect(summary.totalBilledMinor).toBe(20_000n);
      expect(summary.totalAdjustedMinor).toBe(5_000n);
      expect(summary.outstandingBalanceMinor).toBe(15_000n);
    });

    it("handles adjustment direction: DEBIT reduces balance and CREDIT increases balance", () => {
      const bill = createSupplierLedgerEntry({
        amountMinor: 10_000n,
        currentBalanceMinor: 0n,
        entryType: "BILL",
        organizationId: orgId,
        supplierId,
      });

      const adjDebit = createSupplierLedgerEntry({
        amountMinor: 1_500n,
        currentBalanceMinor: bill.balanceAfterMinor,
        direction: "DEBIT",
        entryType: "ADJUSTMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(adjDebit.balanceAfterMinor).toBe(8_500n);

      const adjCredit = createSupplierLedgerEntry({
        amountMinor: 500n,
        currentBalanceMinor: adjDebit.balanceAfterMinor,
        direction: "CREDIT",
        entryType: "ADJUSTMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(adjCredit.balanceAfterMinor).toBe(9_000n);

      const summary = calculateSupplierBalanceFromEntries({
        entries: [bill, adjDebit, adjCredit],
        organizationId: orgId,
        supplierId,
      });
      expect(summary.totalAdjustedMinor).toBe(1_000n);
      expect(summary.outstandingBalanceMinor).toBe(9_000n);
    });

    it("handles OPENING_BALANCE entries correctly", () => {
      const openingCredit = createSupplierLedgerEntry({
        amountMinor: 25_000n,
        currentBalanceMinor: 0n,
        direction: "CREDIT",
        entryType: "OPENING_BALANCE",
        organizationId: orgId,
        supplierId,
      });
      expect(openingCredit.balanceAfterMinor).toBe(25_000n);

      const payment = createSupplierLedgerEntry({
        amountMinor: 10_000n,
        currentBalanceMinor: openingCredit.balanceAfterMinor,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(payment.balanceAfterMinor).toBe(15_000n);

      const summary = calculateSupplierBalanceFromEntries({
        entries: [openingCredit, payment],
        organizationId: orgId,
        supplierId,
      });
      expect(summary.totalBilledMinor).toBe(25_000n);
      expect(summary.totalPaidMinor).toBe(10_000n);
      expect(summary.outstandingBalanceMinor).toBe(15_000n);
    });

    it("supports advance payments leading to negative payable balance", () => {
      const prepay = createSupplierLedgerEntry({
        amountMinor: 10_000n,
        currentBalanceMinor: 0n,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(prepay.balanceAfterMinor).toBe(-10_000n);

      const summary = calculateSupplierBalanceFromEntries({
        entries: [prepay],
        organizationId: orgId,
        supplierId,
      });
      expect(summary.outstandingBalanceMinor).toBe(-10_000n);
    });
  });

  describe("createSupplierLedgerEntry validation and direction enforcement", () => {
    it("enforces CREDIT direction for BILL entries", () => {
      const entry = createSupplierLedgerEntry({
        amountMinor: 5_000n,
        currentBalanceMinor: 1_000n,
        entryType: "BILL",
        organizationId: orgId,
        supplierId,
      });
      expect(entry.direction).toBe("CREDIT");
      expect(entry.balanceAfterMinor).toBe(6_000n);

      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 5_000n,
          currentBalanceMinor: 1_000n,
          direction: "DEBIT",
          entryType: "BILL",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(BusinessRuleError);
    });

    it("enforces DEBIT direction for PAYMENT entries", () => {
      const entry = createSupplierLedgerEntry({
        amountMinor: 4_000n,
        currentBalanceMinor: 10_000n,
        entryType: "PAYMENT",
        organizationId: orgId,
        supplierId,
      });
      expect(entry.direction).toBe("DEBIT");
      expect(entry.balanceAfterMinor).toBe(6_000n);

      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 4_000n,
          currentBalanceMinor: 10_000n,
          direction: "CREDIT",
          entryType: "PAYMENT",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(BusinessRuleError);
    });

    it("enforces DEBIT direction for RETURN_CREDIT entries", () => {
      const entry = createSupplierLedgerEntry({
        amountMinor: 2_000n,
        currentBalanceMinor: 8_000n,
        entryType: "RETURN_CREDIT",
        organizationId: orgId,
        supplierId,
      });
      expect(entry.direction).toBe("DEBIT");
      expect(entry.balanceAfterMinor).toBe(6_000n);

      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 2_000n,
          currentBalanceMinor: 8_000n,
          direction: "CREDIT",
          entryType: "RETURN_CREDIT",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(BusinessRuleError);
    });

    it("requires explicit direction for ADJUSTMENT entries", () => {
      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 1_000n,
          currentBalanceMinor: 5_000n,
          entryType: "ADJUSTMENT",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(BusinessRuleError);
    });

    it("rejects zero or negative entry amounts", () => {
      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 0n,
          currentBalanceMinor: 1_000n,
          entryType: "BILL",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);

      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: -500n,
          currentBalanceMinor: 1_000n,
          entryType: "BILL",
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);
    });

    it("rejects missing or empty organizationId and supplierId", () => {
      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 1_000n,
          currentBalanceMinor: 0n,
          entryType: "BILL",
          organizationId: "",
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);

      expect(() =>
        createSupplierLedgerEntry({
          amountMinor: 1_000n,
          currentBalanceMinor: 0n,
          entryType: "BILL",
          organizationId: orgId,
          supplierId: "   ",
        }),
      ).toThrow(ValidationApplicationError);
    });

    it("detects organization and supplier mismatches across entries", () => {
      const e1 = createSupplierLedgerEntry({
        amountMinor: 10_000n,
        currentBalanceMinor: 0n,
        entryType: "BILL",
        organizationId: orgId,
        supplierId,
      });
      const otherOrgEntry = createSupplierLedgerEntry({
        amountMinor: 5_000n,
        currentBalanceMinor: 0n,
        entryType: "BILL",
        organizationId: "99999999-9999-4999-8999-999999999999",
        supplierId,
      });

      expect(() =>
        calculateSupplierBalanceFromEntries({
          entries: [e1, otherOrgEntry],
          organizationId: orgId,
          supplierId,
        }),
      ).toThrow(BusinessRuleError);
    });
  });

  describe("createSupplierPayment entity creation", () => {
    it("creates a valid SupplierPayment domain model", () => {
      const paymentDate = new Date("2026-09-15T12:00:00Z");
      const payment = createSupplierPayment({
        amountMinor: 25_000n,
        idempotencyKey: "idem-pay-001",
        notes: "Bank transfer settlement",
        organizationId: orgId,
        paymentDate,
        paymentMethod: "BANK_TRANSFER",
        purchaseId,
        reference: "TXN-884920",
        supplierId,
      });

      expect(payment).toMatchObject({
        amountMinor: 25_000n,
        idempotencyKey: "idem-pay-001",
        notes: "Bank transfer settlement",
        organizationId: orgId,
        paymentDate,
        paymentMethod: "BANK_TRANSFER",
        purchaseId,
        reference: "TXN-884920",
        supplierId,
      });
      expect(typeof payment.id).toBe("string");
      expect(payment.id.length).toBeGreaterThan(0);
    });

    it("rejects non-positive payment amount", () => {
      expect(() =>
        createSupplierPayment({
          amountMinor: 0n,
          organizationId: orgId,
          paymentMethod: "CASH",
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);

      expect(() =>
        createSupplierPayment({
          amountMinor: -100n,
          organizationId: orgId,
          paymentMethod: "CASH",
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);
    });

    it("rejects invalid payment method", () => {
      expect(() =>
        createSupplierPayment({
          amountMinor: 5_000n,
          organizationId: orgId,
          // @ts-expect-error test invalid method runtime handling
          paymentMethod: "BITCOIN",
          supplierId,
        }),
      ).toThrow(ValidationApplicationError);
    });
  });
});
