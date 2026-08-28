import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { ReceiveStockWorkflow } from "./_components/receive-stock-workflow";

export const metadata: Metadata = {
  title: "Receive Stock | SENVO Wear Admin",
  description: "Receive incoming SENVO stock into the inventory movement ledger.",
};

export default async function ReceiveStockPage() {
  const session = await getAdminSession();
  return <ReceiveStockWorkflow permissions={session?.permissions ?? []} />;
}
