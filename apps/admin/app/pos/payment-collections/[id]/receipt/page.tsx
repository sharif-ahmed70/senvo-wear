import { PaymentReceiptPreview } from "./payment-receipt-preview";

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentReceiptPreview collectionId={id} />;
}
