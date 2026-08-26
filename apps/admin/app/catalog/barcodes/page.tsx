import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { BarcodeWorkspace } from "./_components/barcode-workspace";

export const metadata: Metadata = {
  title: "Barcodes | SENVO Wear Admin",
  description:
    "Manage real SENVO product-variant barcodes, scanner lookup and barcode readiness.",
};

export default function BarcodesPage() {
  return <BarcodeWorkspace permissions={adminFoundationSession.permissions} />;
}
