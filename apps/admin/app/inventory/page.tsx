import type { Metadata } from "next";
import { adminFoundationSession } from "../_lib/admin-access";
import { InventoryOverview } from "./_components/inventory-overview";

export const metadata: Metadata = {
  title: "Inventory | SENVO Wear Admin",
  description:
    "Review real stock availability, reservations, locations and inventory movement activity.",
};

export default function InventoryPage() {
  return <InventoryOverview permissions={adminFoundationSession.permissions} />;
}
