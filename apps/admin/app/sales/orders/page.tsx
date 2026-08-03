import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesOrdersWorkspace } from "./_components/sales-orders-workspace";

export default function SalesOrdersPage() {
  return (
    <SalesOrdersWorkspace
      permissions={adminFoundationSession.permissions}
      view="list"
    />
  );
}
