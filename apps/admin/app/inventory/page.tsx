import type { Metadata } from "next";
import { getAdminSession } from "../_lib/workforce-auth-server";
import { InventoryOverviewReady } from "./_components/inventory-overview-ready";

export const metadata: Metadata = {
  title: "Inventory | SENVO Wear Admin",
  description:
    "Review real stock availability, reservations, locations and inventory movement activity.",
};

export default async function InventoryPage() {
  const session = await getAdminSession();
  return <InventoryOverviewReady permissions={session?.permissions ?? []} />;
}
