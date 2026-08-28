import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesCountersWorkspace } from "./_components/sales-counters-workspace";

export default function SalesCountersPage() {
  return (
    <SalesCountersWorkspace permissions={adminFoundationSession.permissions} />
  );
}
