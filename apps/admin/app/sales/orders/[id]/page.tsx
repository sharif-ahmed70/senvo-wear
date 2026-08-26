import { adminFoundationSession } from "../../../_lib/admin-access";
import { SalesOrderDetailWorkspace } from "./_components/sales-order-detail-workspace";

export default async function SalesOrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SalesOrderDetailWorkspace
      orderId={id}
      permissions={adminFoundationSession.permissions}
    />
  );
}
