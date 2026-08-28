import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { BoothHistoryWorkspace } from "./_components/booth-history-workspace";

export const metadata: Metadata = {
  title: "Booth History | SENVO Admin",
  description: "Manage real event booth records and preserve booth sales history.",
};

export default async function SalesBoothsPage() {
  const session = await getAdminSession();
  return <BoothHistoryWorkspace permissions={session?.permissions ?? []} />;
}
