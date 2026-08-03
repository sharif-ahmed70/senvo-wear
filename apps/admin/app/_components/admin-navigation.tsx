"use client";

import {
  Boxes,
  Building2,
  LayoutDashboard,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  RadioTower,
  ScanBarcode,
  TentTree,
  UsersRound,
  MonitorSmartphone,
  Clock3,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  visibleAdminNavigation,
  type AdminNavigationItem,
  type AdminSession,
} from "../_lib/admin-access";

const navigationIcons = {
  barcodes: ScanBarcode,
  catalog: ShoppingBag,
  booths: TentTree,
  channels: RadioTower,
  dashboard: LayoutDashboard,
  inventory: Boxes,
  organization: Building2,
  roles: ShieldCheck,
  sales: ShoppingCart,
  stores: MapPin,
  team: UsersRound,
  counter: MonitorSmartphone,
  sessions: Clock3,
} satisfies Record<AdminNavigationItem["icon"], typeof LayoutDashboard>;

export function AdminNavigation({ session }: { session: AdminSession }) {
  return <AdminNavigationList currentPath={usePathname()} session={session} />;
}

export function AdminNavigationList({
  currentPath,
  session,
}: {
  currentPath: string;
  session: AdminSession;
}) {
  return (
    <nav className="admin-nav" aria-label="Primary navigation">
      <p className="admin-nav__label">Workspace</p>
      {visibleAdminNavigation(session).map((item, index, items) => {
        const Icon = navigationIcons[item.icon];
        const settingsItem = [
          "/organization",
          "/store-locations",
          "/team",
          "/roles",
        ].includes(item.href);
        const previousWasSettings =
          index > 0 &&
          ["/organization", "/store-locations", "/team", "/roles"].includes(
            items[index - 1]?.href ?? "",
          );
        const active =
          item.href === "/"
            ? currentPath === "/"
            : currentPath.startsWith(item.href);
        return (
          <div className="admin-nav__item" key={item.href}>
            {settingsItem && !previousWasSettings ? (
              <p className="admin-nav__label admin-nav__label--section">
                Team &amp; Settings
              </p>
            ) : null}
            <Link
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="admin-nav__link"
              href={item.href}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
