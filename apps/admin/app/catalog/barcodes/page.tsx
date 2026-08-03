import { adminFoundationSession } from "../../_lib/admin-access";
import { BarcodeWorkspace } from "./_components/barcode-workspace";

export default function BarcodesPage() {
  return <BarcodeWorkspace permissions={adminFoundationSession.permissions} />;
}
