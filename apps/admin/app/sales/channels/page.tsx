import type { Metadata } from "next";
import { SalesSourcesOverview } from "./_components/sales-sources-overview";

export const metadata: Metadata = {
  title: "Sales Sources | SENVO Admin",
};

export default function SalesChannelsPage() {
  return <SalesSourcesOverview />;
}
