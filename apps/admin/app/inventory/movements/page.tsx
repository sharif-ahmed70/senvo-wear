import type { Metadata } from "next";
import { MovementHistoryWorkspace } from "./_components/movement-history-workspace";

export const metadata: Metadata = {
  title: "Movement History | SENVO Wear Admin",
  description:
    "Review real inventory ledger movement activity across SENVO stock locations.",
};

export default function InventoryMovementsPage() {
  return <MovementHistoryWorkspace />;
}
