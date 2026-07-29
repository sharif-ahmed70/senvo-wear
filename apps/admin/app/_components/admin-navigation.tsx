"use client";

import {
  Boxes,
  Building2,
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  visibleAdminNavigation,
  type AdminNavigationItem,
  type AdminSession,
} from "../_lib/admin-access";

const navigationIcons = {
  catalog: ShoppingBag,
  dashboard: LayoutDashboard,
  inventory: Boxes,
  organization: Building2,
  sales: ShoppingCart,
  users: UsersRound,
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
      {visibleAdminNavigation(session).map((item) => {
        const Icon = navigationIcons[item.icon];
        const active =
          item.href === "/"
            ? currentPath === "/"
            : currentPath.startsWith(item.href);
        return (
          <Link
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className="admin-nav__link"
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
