import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { SalesOrderDetailWorkspace } from "./_components/sales-order-detail-workspace";

export default async function SalesOrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAdminSession();
  return (
    <SalesOrderDetailWorkspace
      orderId={id}
      permissions={session?.permissions ?? []}
    />
  );
}
