import type { Metadata } from "next";
import { BarcodeWorkspaceComplete } from "./_components/barcode-workspace-complete";

export const metadata: Metadata = {
  title: "Barcodes | SENVO Wear Admin",
  description:
    "Manage real SENVO product-variant barcodes, scanner lookup and barcode readiness.",
};

export default function BarcodesPage() {
  return <BarcodeWorkspaceComplete />;
}
