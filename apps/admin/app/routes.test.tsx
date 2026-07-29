import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CatalogPage from "./catalog/page";
import CategoriesPage from "./catalog/categories/page";
import CollectionsPage from "./catalog/collections/page";
import ProductsPage from "./catalog/products/page";
import InventoryPage from "./inventory/page";
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
    ["Products", ProductsPage],
    ["Inventory", InventoryPage],
    ["Sales Orders", SalesOrdersPage],
    ["Organization", OrganizationPage],
    ["Users & Roles", UsersPage],
  ])("renders the %s route", (title, Page) => {
    const html = renderToStaticMarkup(createElement(Page));

    expect(html).toContain(title.replace("&", "&amp;"));
  });
});
