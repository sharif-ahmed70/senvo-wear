export const adminPermissionKeys = [
  "CATALOG:READ",
  "CATALOG:CREATE",
  "CATALOG:UPDATE",
  "INVENTORY:READ",
  "INVENTORY:CREATE",
  "SALES_ORDER:READ",
  "SALES_ORDER:UPDATE",
  "SALES:READ",
  "SALES:CREATE",
  "SALES:UPDATE",
  "ORGANIZATION:READ",
  "ORGANIZATION:UPDATE",
  "TEAM:READ",
  "TEAM:UPDATE",
  "POS:READ",
  "POS:CREATE",
  "POS:UPDATE",
  "PAYMENT:READ",
  "PAYMENT:CREATE",
  "PAYMENT:APPROVE",
  "RECEIPT:READ",
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
    | "dashboard"
    | "catalog"
    | "barcodes"
    | "inventory"
    | "sales"
    | "channels"
    | "booths"
    | "organization"
    | "stores"
    | "team"
    | "roles"
    | "newSale"
    | "counter"
    | "sessions"
    | "checkouts";
  label: string;
  permission?: AdminPermissionKey;
  permissions?: readonly AdminPermissionKey[];
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
    href: "/catalog/barcodes",
    icon: "barcodes",
    label: "Barcodes",
    permission: "CATALOG:READ",
  },
  {
    href: "/inventory",
    icon: "inventory",
    label: "Inventory",
    permission: "INVENTORY:READ",
  },
  {
    href: "/sales/orders",
    icon: "sales",
    label: "Sales Orders",
    permission: "SALES_ORDER:READ",
  },
  {
    href: "/sales/channels",
    icon: "channels",
    label: "Sales Sources",
    permission: "SALES:READ",
  },
  {
    href: "/sales/booths",
    icon: "booths",
    label: "Booth History",
    permission: "SALES:READ",
  },
  {
    href: "/pos/sell",
    icon: "newSale",
    label: "New Sale",
    permissions: [
      "POS:READ",
      "POS:CREATE",
      "POS:UPDATE",
      "SALES:CREATE",
      "PAYMENT:CREATE",
    ],
  },
  {
    href: "/pos/checkouts",
    icon: "checkouts",
    label: "Checkout History",
    permission: "POS:READ",
  },
  {
    href: "/pos/sessions",
    icon: "sessions",
    label: "Sales Sessions",
    permission: "POS:READ",
  },
  {
    href: "/pos/counters",
    icon: "counter",
    label: "Sales Counters",
    permission: "POS:READ",
  },
  {
    href: "/organization",
    icon: "organization",
    label: "Organization",
    permission: "ORGANIZATION:READ",
  },
  {
    href: "/store-locations",
    icon: "stores",
    label: "Store locations",
    permission: "ORGANIZATION:READ",
  },
  {
    href: "/team",
    icon: "team",
    label: "Team",
    permission: "TEAM:READ",
  },
  {
    href: "/roles",
    icon: "roles",
    label: "Roles",
    permission: "TEAM:READ",
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
    (item) =>
      (!item.permission || permissions.has(item.permission)) &&
      (!item.permissions ||
        item.permissions.every((key) => permissions.has(key))),
  );
}
