import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { StockAdjustmentWorkflow } from "./_components/stock-adjustment-workflow";

export const metadata: Metadata = {
  title: "Stock Adjustment | SENVO Wear Admin",
  description:
    "Record verified inventory corrections through SENVO's append-only movement ledger.",
};

export default async function StockAdjustmentPage() {
  const session = await getAdminSession();
  return <StockAdjustmentWorkflow permissions={session?.permissions ?? []} />;
}
