import type { Metadata } from "next";
import { TransferStockWorkflow } from "./_components/transfer-stock-workflow";

export const metadata: Metadata = {
  title: "Transfer Stock | SENVO Wear Admin",
  description:
    "Move available SENVO inventory between active stock locations through the inventory movement ledger.",
};

export default function TransferStockPage() {
  return <TransferStockWorkflow />;
}
