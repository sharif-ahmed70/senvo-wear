import { adminFoundationSession } from "../../../_lib/admin-access";
import { BarcodeGenerationWorkflow } from "./_components/barcode-generation-workflow";

export default function GenerateBarcodesPage() {
  return (
    <BarcodeGenerationWorkflow
      permissions={adminFoundationSession.permissions}
    />
  );
}
