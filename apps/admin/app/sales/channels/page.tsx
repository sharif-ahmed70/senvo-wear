import type { Metadata } from "next";
import { getAdminSession } from "../../_lib/workforce-auth-server";
import { SalesSourcesOverview } from "./_components/sales-sources-overview";

export const metadata: Metadata = {
  title: "Sales Sources | SENVO Admin",
};

export default async function SalesChannelsPage() {
  const session = await getAdminSession();
  return <SalesSourcesOverview permissions={session?.permissions ?? []} />;
}
