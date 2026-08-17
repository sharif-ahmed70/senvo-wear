import { ProductWorkspace } from "../../_components/product-workspace";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <ProductWorkspace slug={(await params).slug} />;
}
