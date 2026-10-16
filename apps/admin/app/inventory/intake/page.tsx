import type { Metadata } from "next";
import { StockIntakeWizard } from "./_components/stock-intake-wizard";

export const metadata: Metadata = {
  title: "নতুন মাল তুলুন | SENVO Wear Admin",
  description:
    "Record a supplier delivery in one step: product, colours, sizes, prices, barcodes, stock and supplier bill.",
};

export default function StockIntakePage() {
  return <StockIntakeWizard />;
}
