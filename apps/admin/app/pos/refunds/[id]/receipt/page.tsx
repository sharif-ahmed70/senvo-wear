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
  return (
    <RefundReceiptPreview printOnLoad={query.print === "1"} refundId={id} />
  );
}
