import type {
  PosCheckoutContract,
  SalesOrderListReadContract,
  StockLocationReadContract,
} from "@senvo/contracts";
import { describe, expect, it } from "vitest";
import { canAccessPath } from "./_lib/admin-access";
import { returnDestinations } from "./pos/checkouts/[id]/checkout-return-workspace";
import { foundSales } from "./pos/return-exchange/_components/return-exchange-finder";

const location = (
  id: string,
  type: string,
  isSellable: boolean,
  status = "ACTIVE",
) => ({ id, isSellable, status, type }) as unknown as StockLocationReadContract;

describe("return destinations", () => {
  it("offers selling stock for good pieces and Return hold for the rest", () => {
    const found = returnDestinations([
      location("main", "WAREHOUSE", true),
      location("hold", "RETURN_HOLD", false),
      location("old", "WAREHOUSE", true, "INACTIVE"),
      location("damage", "DAMAGE_HOLD", false),
    ]);
    expect(found.selling.map((item) => item.id)).toEqual(["main"]);
    expect(found.holds.map((item) => item.id)).toEqual(["hold"]);
  });
});

describe("Return / Exchange finder", () => {
  it("lists only POS sales, newest first, with the customer", () => {
    const order = (id: string, phone: string | null) =>
      ({
        customer: { email: null, name: phone ? "Rina" : null, phone },
        id,
        orderNumber: `POS-${id}`,
      }) as unknown as SalesOrderListReadContract;
    const checkout = (id: string, salesOrderId: string, completedAt: string) =>
      ({
        completedAt,
        id,
        salesOrderId,
        totalMinor: 50_000,
      }) as unknown as PosCheckoutContract;
    const sales = foundSales(
      [order("a", "01711"), order("b", null), order("online", null)],
      [
        checkout("c-a", "a", "2026-11-01T10:00:00.000Z"),
        checkout("c-b", "b", "2026-11-02T10:00:00.000Z"),
      ],
    );
    expect(sales.map((sale) => sale.checkoutId)).toEqual(["c-b", "c-a"]);
    expect(sales[1]?.customer).toBe("Rina · 01711");
    expect(sales[0]?.customer).toBe("Walk-in");
  });

  it("is for people who may take returns", () => {
    const manager = [
      "POS:READ",
      "POS:UPDATE",
      "SALES:UPDATE",
      "SALES_ORDER:READ",
      "INVENTORY:CREATE",
      "PAYMENT:APPROVE",
    ] as const;
    expect(canAccessPath(manager, "/pos/return-exchange")).toBe(true);
    expect(canAccessPath(["POS:READ"], "/pos/return-exchange")).toBe(false);
    // Return receipts stay readable as before.
    expect(canAccessPath(["POS:READ"], "/pos/returns/x/receipt")).toBe(true);
  });
});
