import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CatalogPage from "./catalog/page";
import CategoriesPage from "./catalog/categories/page";
import CollectionsPage from "./catalog/collections/page";
import ColorsPage from "./catalog/colors/page";
import ProductsPage from "./catalog/products/page";
import SizesPage from "./catalog/sizes/page";
import { CatalogWorkspace } from "./catalog/_components/catalog-workspace";
import InventoryPage from "./inventory/page";
import InventoryLocationsPage from "./inventory/locations/page";
import InventoryMovementsPage from "./inventory/movements/page";
import { InventoryWorkspace } from "./inventory/_components/inventory-workspace";
import OrganizationPage from "./organization/page";
import AdminPage from "./page";
import SalesOrdersPage from "./sales-orders/page";
import SalesManagementPage from "./sales/orders/page";
import {
  SalesOrderDetailsPanel,
  SalesOrdersWorkspace,
} from "./sales/orders/_components/sales-orders-workspace";
import type { SalesOrderDetailsReadContract } from "@senvo/contracts";
import UsersPage from "./users/page";

describe("admin routes", () => {
  it.each([
    ["Dashboard", AdminPage],
    ["Catalog", CatalogPage],
    ["Categories", CategoriesPage],
    ["Collections", CollectionsPage],
    ["Colors", ColorsPage],
    ["Products", ProductsPage],
    ["Sizes", SizesPage],
    ["Inventory overview", InventoryPage],
    ["Stock locations", InventoryLocationsPage],
    ["Movement history", InventoryMovementsPage],
    ["Sales Orders", SalesOrdersPage],
    ["Sales Orders", SalesManagementPage],
    ["Organization", OrganizationPage],
    ["Users & Roles", UsersPage],
  ])("renders the %s route", (title, Page) => {
    const html = renderToStaticMarkup(createElement(Page));

    expect(html).toContain(title.replace("&", "&amp;"));
  });

  it("keeps catalog attribute mutations hidden for read-only users", () => {
    const html = renderToStaticMarkup(
      createElement(CatalogWorkspace, {
        kind: "colors",
        permissions: ["CATALOG:READ"],
      }),
    );

    expect(html).toContain("Colors");
    expect(html).not.toContain("Add color");
  });

  it("renders a restricted inventory state without INVENTORY.READ", () => {
    const html = renderToStaticMarkup(
      createElement(InventoryWorkspace, {
        permissions: ["CATALOG:READ"],
        view: "availability",
      }),
    );

    expect(html).toContain("Inventory access is restricted");
    expect(html).not.toContain("Search SKU");
  });

  it("renders restricted sales state without SALES_ORDER.READ", () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrdersWorkspace, {
        permissions: ["CATALOG:READ"],
        view: "list",
      }),
    );
    expect(html).toContain("Sales access is restricted");
    expect(html).not.toContain("Search order number");
  });

  it.each([
    ["DRAFT", ["Reserve", "Cancel"]],
    ["RESERVED", ["Confirm", "Cancel"]],
    ["CONFIRMED", ["Fulfill"]],
    ["FULFILLED", []],
  ] as const)("shows allowed %s lifecycle actions", (status, actions) => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderDetailsPanel, {
        busy: false,
        canUpdate: true,
        onAction: () => undefined,
        order: salesOrderDetails(status),
      }),
    );
    for (const action of ["Reserve", "Confirm", "Fulfill", "Cancel"]) {
      expect(html.includes(`>${action}<`)).toBe(
        actions.includes(action as never),
      );
    }
    expect(html).toContain("Order items");
    expect(html).toContain("Customer");
    expect(html).toContain("Inventory");
  });

  it("hides lifecycle controls without SALES_ORDER.UPDATE", () => {
    const html = renderToStaticMarkup(
      createElement(SalesOrderDetailsPanel, {
        busy: false,
        canUpdate: false,
        onAction: () => undefined,
        order: salesOrderDetails("DRAFT"),
      }),
    );
    expect(html).not.toContain(">Reserve<");
    expect(html).not.toContain(">Cancel<");
  });
});

function salesOrderDetails(
  status: SalesOrderDetailsReadContract["status"],
): SalesOrderDetailsReadContract {
  return {
    channel: "ONLINE",
    currencyCode: "BDT",
    customer: { email: "buyer@test.dev", name: "Buyer", phone: "01700000000" },
    delivery: {
      addressLine1: "Road 1",
      addressLine2: null,
      city: "Dhaka",
      district: "Dhaka",
      postalCode: "1207",
    },
    id: "10000000-0000-4000-8000-000000000003",
    inventory: {
      fulfillment: { movement: null, status: "PENDING" },
      reservation: null,
    },
    lines: [
      {
        color: "Black",
        id: "10000000-0000-4000-8000-000000000004",
        lineNumber: 1,
        lineTotalMinor: 2500,
        productName: "Oxford Shirt",
        quantity: 1,
        size: "L",
        sku: "OX-BLK-L",
        unitPriceMinor: 2500,
      },
    ],
    orderNumber: "SO-1001",
    status,
    timestamps: {
      cancelledAt: null,
      confirmedAt: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      fulfilledAt: null,
      reservedAt: null,
      updatedAt: "2026-08-03T10:00:00.000Z",
    },
    totals: {
      deliveryMinor: 0,
      discountMinor: 0,
      subtotalMinor: 2500,
      totalMinor: 2500,
    },
    version: 1,
  };
}
