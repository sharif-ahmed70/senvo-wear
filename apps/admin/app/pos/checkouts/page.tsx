import { adminFoundationSession } from "../../_lib/admin-access";
import { PosManagementWorkspace } from "../_components/pos-management-workspace";

export default function PosCheckoutsPage() {
  return (
    <PosManagementWorkspace
      permissions={adminFoundationSession.permissions}
      view="checkouts"
    />
  );
}
