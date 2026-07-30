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
});
