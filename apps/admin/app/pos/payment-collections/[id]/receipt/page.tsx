import { adminFoundationSession } from "../../../../_lib/admin-access";
import { PaymentReceiptPreview } from "./payment-receipt-preview";

export default async function PaymentReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <PaymentReceiptPreview
      collectionId={id}
      permissions={adminFoundationSession.permissions}
      printOnLoad={query.print === "1"}
    />
  );
}
