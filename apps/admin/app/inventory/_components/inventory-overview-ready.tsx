"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { useAdminPermissions } from "../../admin-shell";
import { InventoryOverview } from "./inventory-overview";

const readyActionRoutes = new Map([
  ["Receive Stock", "/inventory/receive"],
  ["Transfer Stock", "/inventory/transfer"],
  ["Stock Adjustment", "/inventory/adjustment"],
] as const);

export function InventoryOverviewReady({
  permissions: propsPermissions,
}: {
  permissions?: readonly AdminPermissionKey[];
} = {}) {
  const sessionPermissions = useAdminPermissions();
  const permissions = propsPermissions ?? sessionPermissions;
  const router = useRouter();
  const canCreateInventory = permissions.includes("INVENTORY:CREATE");

  function routeReadyActions(event: MouseEvent<HTMLDivElement>) {
    if (!canCreateInventory) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button) return;

    const label = button.textContent?.replace(/\s+/gu, " ").trim() ?? "";
    const route = [...readyActionRoutes.entries()].find(([title]) =>
      label.startsWith(title),
    )?.[1];
    if (!route) return;

    event.preventDefault();
    event.stopPropagation();
    router.push(route);
  }

  return (
    <div onClickCapture={routeReadyActions}>
      <InventoryOverview permissions={permissions} />
    </div>
  );
}
