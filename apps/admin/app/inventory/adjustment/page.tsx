import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { StockAdjustmentWorkflow } from "./_components/stock-adjustment-workflow";

export const metadata: Metadata = {
  title: "Stock Adjustment | SENVO Wear Admin",
  description:
    "Record verified inventory corrections through SENVO's append-only movement ledger.",
};

export default function StockAdjustmentPage() {
  return (
    <StockAdjustmentWorkflow permissions={adminFoundationSession.permissions} />
  );
}
