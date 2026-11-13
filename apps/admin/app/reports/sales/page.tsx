import type { Metadata } from "next";
import { SalesByProduct } from "./_components/sales-by-product";

export const metadata: Metadata = {
  title: "Sales by product | SENVO Wear Admin",
  description: "Which products sold in a period, with pieces and sales.",
};

export default function SalesByProductPage() {
  return <SalesByProduct />;
}
