import { adminFoundationSession } from "../../../../_lib/admin-access";
import { ReceiptPreview } from "./receipt-preview";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <ReceiptPreview
      checkoutId={id}
      permissions={adminFoundationSession.permissions}
      printOnLoad={query.print === "1"}
    />
  );
}
