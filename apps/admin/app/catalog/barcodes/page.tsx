import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { BarcodeWorkspaceComplete } from "./_components/barcode-workspace-complete";

export const metadata: Metadata = {
  title: "Barcodes | SENVO Wear Admin",
  description:
    "Manage real SENVO product-variant barcodes, scanner lookup and barcode readiness.",
};

export default async function BarcodesPage() {
  const session = await getAdminSession();
  return <BarcodeWorkspaceComplete permissions={session?.permissions ?? []} />;
}
