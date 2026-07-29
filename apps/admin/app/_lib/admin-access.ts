export const adminPermissionKeys = [
  "CATALOG:READ",
  "INVENTORY:READ",
  "SALES_ORDER:READ",
  "ORGANIZATION:READ",
  "USER:READ",
] as const;

export type AdminPermissionKey = (typeof adminPermissionKeys)[number];

export type AdminSession = {
  displayName: string;
  organizationName: string;
  permissions: readonly AdminPermissionKey[];
  role: "OWNER" | "ADMIN" | "MANAGER" | "STAFF";
  userId: string;
};

export type AdminNavigationItem = {
  href: string;
  icon:
    "dashboard" | "catalog" | "inventory" | "sales" | "organization" | "users";
  label: string;
  permission?: AdminPermissionKey;
};

export const adminNavigationItems: readonly AdminNavigationItem[] = [
  { href: "/", icon: "dashboard", label: "Dashboard" },
  {
    href: "/catalog",
    icon: "catalog",
    label: "Catalog",
    permission: "CATALOG:READ",
  },
  {
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    permission: "INVENTORY:READ",
  },
  {
    href: "/sales-orders",
    icon: "sales",
    label: "Sales Orders",
    permission: "SALES_ORDER:READ",
  },
  {
    href: "/organization",
    icon: "organization",
    label: "Organization",
    permission: "ORGANIZATION:READ",
  },
  {
    href: "/users",
    icon: "users",
    label: "Users & Roles",
    permission: "USER:READ",
  },
];

// Placeholder only: a future authenticated server boundary will supply this state.
export const adminFoundationSession: AdminSession = {
  displayName: "Admin preview",
  organizationName: "SENVO Wear",
  permissions: adminPermissionKeys,
  role: "OWNER",
  userId: "admin-foundation-preview",
};

export function visibleAdminNavigation(
  session: AdminSession,
): readonly AdminNavigationItem[] {
  const permissions = new Set(session.permissions);
  return adminNavigationItems.filter(
    (item) => !item.permission || permissions.has(item.permission),
  );
}
