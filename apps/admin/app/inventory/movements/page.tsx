import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { MovementHistoryWorkspace } from "./_components/movement-history-workspace";

export const metadata: Metadata = {
  title: "Movement History | SENVO Wear Admin",
  description: "Review real inventory ledger movement activity across SENVO stock locations.",
};

export default async function InventoryMovementsPage() {
  const session = await getAdminSession();
  return <MovementHistoryWorkspace permissions={session?.permissions ?? []} />;
}
