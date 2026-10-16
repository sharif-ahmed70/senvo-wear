import { ShippingLabelPreview } from "./shipping-label-preview";

export default async function ShippingLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShippingLabelPreview orderId={id} />;
}
