import { adminFoundationSession } from "../../_lib/admin-access";
import { PosManagementWorkspace } from "../_components/pos-management-workspace";

export default function SalesSessionsPage() {
  return (
    <PosManagementWorkspace
      permissions={adminFoundationSession.permissions}
      view="sessions"
    />
  );
}
