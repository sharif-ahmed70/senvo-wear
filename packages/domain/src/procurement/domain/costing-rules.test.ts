import { describe, expect, it } from "vitest";
import {
  calculateMovingWeightedAverage,
  calculateSaleLineCostSnapshot,
  deriveCostStateAfterReceipt,
  validatePurchaseLineData,
} from "./costing-rules.js";
import type { VariantCostState } from "./models.js";

describe("Costing Domain Rules", () => {
  describe("calculateMovingWeightedAverage", () => {
    it("calculates moving weighted average correctly for initial purchase (zero on-hand)", () => {
      // 100 pcs received @ 500 taka (50,000 poisha)
      const result = calculateMovingWeightedAverage({
        existingOnHandQuantity: 0,
        existingValueMinor: 0n,
        receivedCostMinor: 5000000n, // 100 * 50,000 poisha = 5,000,000 poisha
        receivedQuantity: 100,
      });

      expect(result.newTotalQuantity).toBe(100);
      expect(result.newTotalValueMinor).toBe(5000000n);
      expect(result.newAverageCostMinor).toBe(50000); // 500 taka per unit
    });

    it("calculates moving weighted average when existing on-hand stock is present", () => {
      // Existing: 100 pcs @ 400 taka (40,000 poisha) = 4,000,000 poisha
      // Received: 100 pcs @ 500 taka (50,000 poisha) = 5,000,000 poisha
      // Total value: 9,000,000 poisha for 200 pcs => 45,000 poisha (450 taka)
      const result = calculateMovingWeightedAverage({
        existingOnHandQuantity: 100,
        existingValueMinor: 4000000n,
        receivedCostMinor: 5000000n,
        receivedQuantity: 100,
      });

      expect(result.newTotalQuantity).toBe(200);
      expect(result.newTotalValueMinor).toBe(9000000n);
      expect(result.newAverageCostMinor).toBe(45000); // 450 taka
    });

    it("handles on-hand stock that includes reserved inventory", () => {
      // Prompt Rule: "Use on-hand quantity. Reserved stock remains included. Available quantity must NOT be used."
      // Suppose Physical On-Hand is 50 (of which 20 are reserved for customer orders, so available is 30).
      // Calculation must use 50 (on-hand), NOT 30 (available).
      const onHandQuantity = 50;
      const existingValue = 2500000n; // 50 * 50,000 poisha

      // Receive 50 pcs @ 60,000 poisha = 3,000,000 poisha
      const result = calculateMovingWeightedAverage({
        existingOnHandQuantity: onHandQuantity,
        existingValueMinor: existingValue,
        receivedCostMinor: 3000000n,
        receivedQuantity: 50,
      });

      expect(result.newTotalQuantity).toBe(100);
      expect(result.newTotalValueMinor).toBe(5500000n);
      expect(result.newAverageCostMinor).toBe(55000); // 550 taka
    });

    it("rounds average cost to the nearest integer poisha", () => {
      // Existing: 10 pcs @ 3333 poisha = 33330 poisha
      // Received: 5 pcs @ 5000 poisha = 25000 poisha
      // Total: 58330 poisha / 15 pcs = 3888.666... poisha => rounds to 3889 poisha
      const result = calculateMovingWeightedAverage({
        existingOnHandQuantity: 10,
        existingValueMinor: 33330n,
        receivedCostMinor: 25000n,
        receivedQuantity: 5,
      });

      expect(result.newTotalQuantity).toBe(15);
      expect(result.newTotalValueMinor).toBe(58330n);
      expect(result.newAverageCostMinor).toBe(3889);
    });

    it("throws ValidationApplicationError when received quantity is zero or negative", () => {
      expect(() =>
        calculateMovingWeightedAverage({
          existingOnHandQuantity: 10,
          existingValueMinor: 500000n,
          receivedCostMinor: 100000n,
          receivedQuantity: 0,
        }),
      ).toThrowError("Received quantity must be greater than zero");

      expect(() =>
        calculateMovingWeightedAverage({
          existingOnHandQuantity: 10,
          existingValueMinor: 500000n,
          receivedCostMinor: 100000n,
          receivedQuantity: -5,
        }),
      ).toThrowError("Received quantity must be greater than zero");
    });

    it("throws ValidationApplicationError when received cost is negative", () => {
      expect(() =>
        calculateMovingWeightedAverage({
          existingOnHandQuantity: 10,
          existingValueMinor: 500000n,
          receivedCostMinor: -100n,
          receivedQuantity: 5,
        }),
      ).toThrowError("Received cost cannot be negative");
    });

    it("throws BusinessRuleError when existing on-hand quantity is negative", () => {
      expect(() =>
        calculateMovingWeightedAverage({
          existingOnHandQuantity: -2,
          existingValueMinor: 0n,
          receivedCostMinor: 100000n,
          receivedQuantity: 10,
        }),
      ).toThrowError("Negative on-hand quantity cannot be used");
    });
  });

  describe("calculateSaleLineCostSnapshot", () => {
    const knownCostState: VariantCostState = {
      averageCostMinor: 45000,
      costUnknownReason: null,
      createdAt: new Date(),
      id: "cost-state-1",
      inventoryValueMinor: 9000000n,
      isCostKnown: true,
      lastCostEventAt: new Date(),
      organizationId: "org-1",
      productVariantId: "var-1",
      updatedAt: new Date(),
      version: 1,
    };

    it("snapshots unit cost and computes total cost when cost is known", () => {
      const snapshot = calculateSaleLineCostSnapshot({
        costState: knownCostState,
        quantity: 3,
      });

      expect(snapshot.isCostKnown).toBe(true);
      expect(snapshot.unitCostMinor).toBe(45000);
      expect(snapshot.totalCostMinor).toBe(135000n); // 3 * 45,000 poisha
      expect(snapshot.costUnknownReason).toBeNull();
    });

    it("records unknown cost status when cost state is missing or unknown", () => {
      const unknownCostState: VariantCostState = {
        ...knownCostState,
        averageCostMinor: null,
        costUnknownReason: "OPENING_STOCK_UNKNOWN",
        isCostKnown: false,
      };

      const snapshot1 = calculateSaleLineCostSnapshot({
        costState: unknownCostState,
        quantity: 2,
      });

      expect(snapshot1.isCostKnown).toBe(false);
      expect(snapshot1.unitCostMinor).toBeNull();
      expect(snapshot1.totalCostMinor).toBeNull();
      expect(snapshot1.costUnknownReason).toBe("OPENING_STOCK_UNKNOWN");

      const snapshot2 = calculateSaleLineCostSnapshot({
        costState: null,
        quantity: 2,
      });

      expect(snapshot2.isCostKnown).toBe(false);
      expect(snapshot2.unitCostMinor).toBeNull();
      expect(snapshot2.totalCostMinor).toBeNull();
      expect(snapshot2.costUnknownReason).toBe("OPENING_STOCK_UNKNOWN");
    });

    it("throws ValidationApplicationError when quantity is not positive", () => {
      expect(() =>
        calculateSaleLineCostSnapshot({
          costState: knownCostState,
          quantity: 0,
        }),
      ).toThrowError("Sale line quantity must be greater than zero");
    });
  });

  describe("validatePurchaseLineData", () => {
    it("accepts valid purchase line parameters", () => {
      expect(() =>
        validatePurchaseLineData({
          lineNumber: 1,
          productName: "Men's Casual Shirt",
          productVariantId: "var-123",
          quantity: 50,
          sku: "SHIRT-BLK-M",
          unitCostMinor: 45000,
        }),
      ).not.toThrow();
    });

    it("validates line number, quantity, and unit cost", () => {
      expect(() =>
        validatePurchaseLineData({
          lineNumber: 0,
          productName: "",
          productVariantId: "",
          quantity: -1,
          sku: "",
          unitCostMinor: -50,
        }),
      ).toThrowError("Invalid purchase line data");
    });
  });

  describe("deriveCostStateAfterReceipt", () => {
    it("Case 1 (Zero existing quantity): establishes known unit cost baseline for newly received stock", () => {
      // 100 pcs received @ 500 taka (50000 poisha) with 0 prior on-hand
      const derived = deriveCostStateAfterReceipt({
        costState: null,
        existingOnHandQuantity: 0,
        receivedQuantity: 100,
        unitCostMinor: 50000,
      });

      expect(derived.beforeQuantity).toBe(0);
      expect(derived.beforeAverageCostMinor).toBeNull();
      expect(derived.beforeValueMinor).toBe(0n);
      expect(derived.valueChangeMinor).toBe(5000000n);
      expect(derived.afterQuantity).toBe(100);
      expect(derived.afterAverageCostMinor).toBe(50000);
      expect(derived.afterValueMinor).toBe(5000000n);
      expect(derived.costUnknownReason).toBeNull();
      expect(derived.isCostKnown).toBe(true);
    });

    it("Case 2 (Existing known cost): applies moving weighted average using stored inventoryValueMinor", () => {
      // Existing: 20 pcs on hand, stored inventory value 1,000,000 poisha @ 50,000 poisha avg
      // Received: 100 pcs @ 600 taka (60,000 poisha) = 6,000,000 poisha
      // Total: 7,000,000 poisha / 120 pcs = 58,333.333... poisha => 58333 poisha
      const derived = deriveCostStateAfterReceipt({
        costState: {
          averageCostMinor: 50000,
          costUnknownReason: null,
          createdAt: new Date(),
          id: "cs-1",
          inventoryValueMinor: 1000000n,
          isCostKnown: true,
          lastCostEventAt: new Date(),
          organizationId: "org-1",
          productVariantId: "var-1",
          updatedAt: new Date(),
          version: 1,
        },
        existingOnHandQuantity: 20,
        receivedQuantity: 100,
        unitCostMinor: 60000,
      });

      expect(derived.beforeQuantity).toBe(20);
      expect(derived.beforeAverageCostMinor).toBe(50000);
      expect(derived.beforeValueMinor).toBe(1000000n);
      expect(derived.valueChangeMinor).toBe(6000000n);
      expect(derived.afterQuantity).toBe(120);
      expect(derived.afterAverageCostMinor).toBe(58333);
      expect(derived.afterValueMinor).toBe(7000000n);
      expect(derived.costUnknownReason).toBeNull();
      expect(derived.isCostKnown).toBe(true);
    });

    it("Case 3 (Existing unknown cost): preserves isCostKnown=false, keeps costUnknownReason, leaves averageCostMinor null, and never imputes cost to existing unknown stock", () => {
      // 10 pcs on hand with unknown cost; receive 100 pcs @ 500 taka (50000 poisha)
      const derived = deriveCostStateAfterReceipt({
        costState: {
          averageCostMinor: null,
          costUnknownReason: "OPENING_STOCK_UNKNOWN",
          createdAt: new Date(),
          id: "cs-1",
          inventoryValueMinor: 0n,
          isCostKnown: false,
          lastCostEventAt: null,
          organizationId: "org-1",
          productVariantId: "var-1",
          updatedAt: new Date(),
          version: 1,
        },
        existingOnHandQuantity: 10,
        receivedQuantity: 100,
        unitCostMinor: 50000,
      });

      expect(derived.beforeQuantity).toBe(10);
      expect(derived.beforeAverageCostMinor).toBeNull();
      expect(derived.beforeValueMinor).toBe(0n);
      expect(derived.valueChangeMinor).toBe(5000000n); // only received 100 * 50,000 poisha
      expect(derived.afterQuantity).toBe(110);
      expect(derived.afterAverageCostMinor).toBeNull(); // cannot determine blended cost when 10 units are uncosted
      expect(derived.afterValueMinor).toBe(5000000n); // 0n + 5,000,000n (never imputes 500,000 poisha to the 10 unknown units)
      expect(derived.costUnknownReason).toBe("OPENING_STOCK_UNKNOWN");
      expect(derived.isCostKnown).toBe(false);
    });
  });
});
