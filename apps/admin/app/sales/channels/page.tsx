import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesSourcesOverview } from "./_components/sales-sources-overview";

export const metadata: Metadata = {
  title: "Sales Sources | SENVO Admin",
};

export default function SalesChannelsPage() {
  return (
    <SalesSourcesOverview permissions={adminFoundationSession.permissions} />
  );
}
