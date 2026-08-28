import { getAdminSession } from "../../_lib/workforce-auth-server";
import { SalesSessionsWorkspace } from "./_components/sales-sessions-workspace";

export default async function SalesSessionsPage() {
  const session = await getAdminSession();
  return <SalesSessionsWorkspace permissions={session?.permissions ?? []} />;
}
