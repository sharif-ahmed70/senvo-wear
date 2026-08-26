"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { AdminPermissionKey } from "../../_lib/admin-access";
import { InventoryOverview } from "./inventory-overview";

export function InventoryOverviewReady({
  permissions,
}: {
  permissions: readonly AdminPermissionKey[];
}) {
  const router = useRouter();

  function routeReadyActions(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button");
    if (!button) return;
    const label = button.textContent?.replace(/\s+/gu, " ").trim() ?? "";

    const route = label.startsWith("Receive Stock")
      ? "/inventory/receive"
      : label.startsWith("Transfer Stock")
        ? "/inventory/transfer"
        : label.startsWith("Stock Adjustment")
          ? "/inventory/adjustment"
          : null;
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
