import { getAdminSession } from "../../../../_lib/workforce-auth-server";
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
  const session = await getAdminSession();
  return (
    <PaymentReceiptPreview
      collectionId={id}
      permissions={session?.permissions ?? []}
      printOnLoad={query.print === "1"}
    />
  );
}
