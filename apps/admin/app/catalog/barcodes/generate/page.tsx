import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { BarcodeGenerationWorkflow } from "./_components/barcode-generation-workflow";

export default async function GenerateBarcodesPage() {
  const session = await getAdminSession();
  return <BarcodeGenerationWorkflow permissions={session?.permissions ?? []} />;
}
