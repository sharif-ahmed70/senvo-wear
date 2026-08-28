import { getAdminSession } from "../../../../_lib/workforce-auth-server";
import { RefundReceiptPreview } from "./refund-receipt-preview";

export default async function RefundReceiptPage({
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
    <RefundReceiptPreview
      permissions={session?.permissions ?? []}
      printOnLoad={query.print === "1"}
      refundId={id}
    />
  );
}
