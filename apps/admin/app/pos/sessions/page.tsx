import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesSessionsWorkspace } from "./_components/sales-sessions-workspace";

export default function SalesSessionsPage() {
  return (
    <SalesSessionsWorkspace permissions={adminFoundationSession.permissions} />
  );
}
