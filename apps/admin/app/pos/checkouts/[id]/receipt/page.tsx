import { ReceiptPreview } from "./receipt-preview";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptPreview checkoutId={id} />;
}
