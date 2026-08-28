import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { SalesOrdersListWorkspace } from "./_components/sales-orders-list-workspace";

export const metadata: Metadata = {
  title: "Sales Orders | SENVO Wear Admin",
  description: "Review and find SENVO sales orders across supported sales sources.",
};

export default async function SalesOrdersPage() {
  const session = await getAdminSession();
  return <SalesOrdersListWorkspace permissions={session?.permissions ?? []} />;
}
