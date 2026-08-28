import { getAdminSession } from "../../_lib/workforce-auth-server";
import { SalesCountersWorkspace } from "./_components/sales-counters-workspace";

export default async function SalesCountersPage() {
  const session = await getAdminSession();
  return <SalesCountersWorkspace permissions={session?.permissions ?? []} />;
}
