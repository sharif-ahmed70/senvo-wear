import { adminFoundationSession } from "../../../_lib/admin-access";
import { SalesOrdersWorkspace } from "../_components/sales-orders-workspace";

export default async function SalesOrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <SalesOrdersWorkspace
      orderId={id}
      permissions={adminFoundationSession.permissions}
      view="details"
    />
  );
}
