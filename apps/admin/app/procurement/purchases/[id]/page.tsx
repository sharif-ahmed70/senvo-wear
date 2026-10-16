import { PurchaseHistoryWorkspace } from "../_components/purchase-history-workspace";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseHistoryWorkspace purchaseId={id} view="details" />;
}
