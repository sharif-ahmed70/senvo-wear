import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import { NO_ACCESS_MESSAGE } from "./_components/no-access-state";
import {
  adminPermissionKeys,
  canAccessPath,
  requiredPermissionsForPath,
  visibleAdminNavigation,
  type AdminPermissionKey,
  type AdminSession,
} from "./_lib/admin-access";
import { AdminShellView } from "./admin-shell";
import { CatalogOverview } from "./catalog/_components/catalog-overview";
import { ProductHistoryModal } from "./inventory/_components/product-history-modal";
import {
  assignableRolesFor,
  roleOptionLabel,
  teamRowAccess,
} from "./organization/_lib/team-roles";

// Admin-visible keys of the role matrix (role-permission-policy.ts).
const STAFF: AdminPermissionKey[] = [
  "CATALOG:READ",
  "INVENTORY:READ",
  "SALES:READ",
  "SALES:CREATE",
  "POS:CREATE",
  "POS:READ",
  "POS:UPDATE",
  "SALES_ORDER:READ",
  "PAYMENT:CREATE",
  "PAYMENT:READ",
  "RECEIPT:READ",
];
const MANAGER: AdminPermissionKey[] = [
  "CATALOG:CREATE",
  "CATALOG:READ",
  "CATALOG:UPDATE",
  "INVENTORY:CREATE",
  "INVENTORY:READ",
  "INVENTORY:UPDATE",
  "SALES_ORDER:READ",
  "SALES_ORDER:UPDATE",
  "SALES:READ",
  "SALES:CREATE",
  "SALES:UPDATE",
  "POS:READ",
  "POS:CREATE",
  "POS:UPDATE",
  "PAYMENT:READ",
  "PAYMENT:CREATE",
  "PAYMENT:APPROVE",
  "RECEIPT:READ",
  "PROCUREMENT:READ",
  "PROCUREMENT:CREATE",
];
const OWNER: AdminPermissionKey[] = [...adminPermissionKeys];

function session(
  role: AdminSession["role"],
  permissions: AdminPermissionKey[],
): AdminSession {
  return {
    displayName: role,
    organizationName: "SENVO Wear",
    permissions,
    role,
    userId: `${role.toLowerCase()}-user`,
  };
}

describe("route access by role", () => {
  it.each([
    ["/procurement/suppliers", false, true, true],
    ["/procurement/purchases/new", false, true, true],
    ["/inventory/intake", false, true, true],
    ["/inventory/receive", false, true, true],
    ["/team", false, false, true],
    ["/roles", false, false, true],
    ["/organization", false, false, true],
    ["/catalog/products/new", false, true, true],
    ["/pos/sell", true, true, true],
    ["/inventory", true, true, true],
    ["/catalog", true, true, true],
  ] as const)(
    "%s staff=%s manager=%s owner=%s",
    (path, staff, manager, owner) => {
      expect(canAccessPath(STAFF, path)).toBe(staff);
      expect(canAccessPath(MANAGER, path)).toBe(manager);
      expect(canAccessPath(OWNER, path)).toBe(owner);
    },
  );

  it("matches the longest route prefix", () => {
    expect(requiredPermissionsForPath("/inventory/receive/x")).toEqual([
      "INVENTORY:CREATE",
    ]);
    expect(requiredPermissionsForPath("/inventory-other")).toEqual([]);
    expect(requiredPermissionsForPath("/")).toEqual([]);
  });

  it("hides supplier, purchase and team navigation from staff", () => {
    const hrefs = visibleAdminNavigation(session("STAFF", STAFF)).map(
      (item) => item.href,
    );
    expect(hrefs).toContain("/pos/sell");
    expect(hrefs).not.toContain("/procurement/suppliers");
    expect(hrefs).not.toContain("/procurement/purchases");
    expect(hrefs).not.toContain("/team");
    expect(hrefs).not.toContain("/organization");
  });

  it("shows a friendly no-access state on a direct visit", () => {
    const html = renderToStaticMarkup(
      <AdminShellView
        isPublicAuthRoute={false}
        pathname="/procurement/suppliers"
        state={{
          credentials: {} as never,
          kind: "authenticated",
          session: session("STAFF", STAFF),
        }}
      >
        <p>secret supplier page</p>
      </AdminShellView>,
    );
    expect(html).toContain(NO_ACCESS_MESSAGE);
    expect(html).not.toContain("secret supplier page");
    expect(html).not.toContain('href="/inventory/receive"');
    expect(html).toContain('href="/pos/sell"');
  });
});

describe("team role picker rules", () => {
  const members = [
    { role: "OWNER", status: "ACTIVE", userId: "owner-user" },
    { role: "ADMIN", status: "ACTIVE", userId: "admin-user" },
    { role: "STAFF", status: "ACTIVE", userId: "staff-user" },
  ] as const;

  it("limits the roles each actor may assign", () => {
    expect(assignableRolesFor("OWNER")).toEqual([
      "OWNER",
      "ADMIN",
      "MANAGER",
      "STAFF",
    ]);
    expect(assignableRolesFor("ADMIN")).toEqual(["MANAGER", "STAFF"]);
    expect(assignableRolesFor("MANAGER")).toEqual([]);
    expect(roleOptionLabel("STAFF")).toBe(
      "Staff — বিক্রয়কর্মী — শুধু বিক্রি আর মাল দেখা",
    );
  });

  it("locks your own row, owner rows for admins and the last owner", () => {
    const owner = { role: "OWNER" as const, userId: "owner-user" };
    const admin = { role: "ADMIN" as const, userId: "admin-user" };
    expect(teamRowAccess(owner, members[0], members)).toMatchObject({
      canChange: false,
      isSelf: true,
    });
    expect(teamRowAccess(admin, members[0], members).canChange).toBe(false);
    expect(teamRowAccess(admin, members[1], members).isSelf).toBe(true);
    expect(teamRowAccess(admin, members[2], members).canChange).toBe(true);
    expect(teamRowAccess(owner, members[1], members).canChange).toBe(true);
    // Another owner looking at the only active owner.
    const secondOwner = { role: "OWNER" as const, userId: "other-owner" };
    expect(teamRowAccess(secondOwner, members[0], members)).toMatchObject({
      canChange: false,
      lockedReason: "শেষ মালিককে সরানো যায় না",
    });
  });
});

describe("cost visibility", () => {
  it("hides purchase cost from staff in the product history", () => {
    const props = {
      onClose: () => undefined,
      productCode: "TS-0001",
      productId: "33333333-3333-4333-8333-333333333333",
      productName: "Polo",
    };
    expect(
      renderToStaticMarkup(
        <ProductHistoryModal {...props} permissions={STAFF} />,
      ),
    ).not.toContain("Purchases");
    expect(
      renderToStaticMarkup(
        <ProductHistoryModal {...props} permissions={MANAGER} />,
      ),
    ).toContain("Purchases");
  });

  it("hides product creation from staff in the catalog", () => {
    expect(
      renderToStaticMarkup(<CatalogOverview permissions={STAFF} />),
    ).not.toContain('href="/catalog/products/new"');
    expect(
      renderToStaticMarkup(<CatalogOverview permissions={MANAGER} />),
    ).toContain('href="/catalog/products/new"');
  });
});
