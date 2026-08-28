import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { StockLocationsWorkspace } from "./_components/stock-locations-workspace";

export const metadata: Metadata = {
  title: "Stock Locations | SENVO Wear Admin",
  description: "Review active, sellable and operational inventory stock locations.",
};

export default async function InventoryLocationsPage() {
  const session = await getAdminSession();
  return <StockLocationsWorkspace permissions={session?.permissions ?? []} />;
}
