import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminAppFrame } from "./_components/admin-app-frame";
import { AdminNavigationList } from "./_components/admin-navigation";
import { adminFoundationSession, type AdminSession } from "./_lib/admin-access";

describe("admin navigation", () => {
  it("renders every initial module for an authorized owner", () => {
    const html = renderToStaticMarkup(
      createElement(AdminNavigationList, {
        currentPath: "/inventory",
        session: adminFoundationSession,
      }),
    );

    for (const label of [
      "Dashboard",
      "Catalog",
      "Inventory",
      "Sales Orders",
      "Organization",
      "Users &amp; Roles",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/inventory"');
  });

  it("hides modules without the matching view permission", () => {
    const session: AdminSession = {
      ...adminFoundationSession,
      permissions: ["CATALOG:READ"],
      role: "STAFF",
    };
    const html = renderToStaticMarkup(
      createElement(AdminNavigationList, { currentPath: "/", session }),
    );

    expect(html).toContain("Dashboard");
    expect(html).toContain("Catalog");
    expect(html).not.toContain("Inventory");
    expect(html).not.toContain("Users &amp; Roles");
  });

  it("renders an unauthorized state without application navigation", () => {
    const html = renderToStaticMarkup(
      createElement(
        AdminAppFrame,
        { session: null },
        createElement("p", null, "Protected content"),
      ),
    );

    expect(html).toContain("Access required");
    expect(html).not.toContain("Primary navigation");
    expect(html).not.toContain("Protected content");
  });
});
