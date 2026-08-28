import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { ProductInventoryDetail } from "../_components/product-inventory-detail";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAdminSession();
  return (
    <ProductInventoryDetail
      permissions={session?.permissions ?? []}
      productId={id}
    />
  );
}
