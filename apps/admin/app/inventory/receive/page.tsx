import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { ReceiveStockWorkflow } from "./_components/receive-stock-workflow";

export const metadata: Metadata = {
  title: "Receive Stock | SENVO Wear Admin",
  description: "Receive incoming SENVO stock into the inventory movement ledger.",
};

export default function ReceiveStockPage() {
  return <ReceiveStockWorkflow permissions={adminFoundationSession.permissions} />;
}
