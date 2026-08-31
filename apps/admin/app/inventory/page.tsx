import type { Metadata } from "next";
import { InventoryOverviewReady } from "./_components/inventory-overview-ready";

export const metadata: Metadata = {
  title: "Inventory | SENVO Wear Admin",
  description:
    "Review real stock availability, reservations, locations and inventory movement activity.",
};

export default function InventoryPage() {
  return <InventoryOverviewReady />;
}
