import { adminFoundationSession } from "../../../../_lib/admin-access";
import { ReturnReceiptPreview } from "./return-receipt-preview";

export default async function ReturnReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <ReturnReceiptPreview
      printOnLoad={query.print === "1"}
      returnId={id}
      permissions={adminFoundationSession.permissions}
    />
  );
}
