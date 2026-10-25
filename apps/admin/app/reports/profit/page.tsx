import type { Metadata } from "next";
import { ProfitByProduct } from "./_components/profit-by-product";

export const metadata: Metadata = {
  title: "Profit by product | SENVO Wear Admin",
  description: "Which products sold in a period and the estimated profit on each.",
};

export default function ProfitByProductPage() {
  return <ProfitByProduct />;
}
