import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { StockLocationsWorkspace } from "./_components/stock-locations-workspace";

export const metadata: Metadata = {
  title: "Stock Locations | SENVO Wear Admin",
  description: "Review active, sellable and operational inventory stock locations.",
};

export default function InventoryLocationsPage() {
  return (
    <StockLocationsWorkspace permissions={adminFoundationSession.permissions} />
  );
}
