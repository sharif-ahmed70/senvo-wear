import type { Metadata } from "next";
import { adminFoundationSession } from "../../_lib/admin-access";
import { BoothHistoryWorkspace } from "./_components/booth-history-workspace";

export const metadata: Metadata = {
  title: "Booth History | SENVO Admin",
  description:
    "Manage real event booth records and preserve booth sales history.",
};

export default function SalesBoothsPage() {
  return (
    <BoothHistoryWorkspace permissions={adminFoundationSession.permissions} />
  );
}
