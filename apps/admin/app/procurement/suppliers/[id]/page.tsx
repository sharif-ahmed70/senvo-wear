import { SupplierWorkspace } from "../_components/supplier-workspace";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SupplierWorkspace supplierId={id} view="details" />;
}
