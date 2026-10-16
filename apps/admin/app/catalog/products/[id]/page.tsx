import { ProductInventoryDetail } from "../_components/product-inventory-detail";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductInventoryDetail productId={id} />;
}
