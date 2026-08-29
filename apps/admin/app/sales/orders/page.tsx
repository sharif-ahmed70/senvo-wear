import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesOrdersListWorkspace } from "./_components/sales-orders-list-workspace";

export const metadata: Metadata = {
  title: "Sales Orders | SENVO Wear Admin",
  description:
    "Review and find SENVO sales orders across supported sales sources.",
};

export default function SalesOrdersPage() {
  return (
    <SalesOrdersListWorkspace
      permissions={adminFoundationSession.permissions}
    />
  );
}
