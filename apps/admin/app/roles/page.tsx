import { adminFoundationSession } from "../_lib/admin-access";
import { RolesPermissionsWorkspace } from "./_components/roles-permissions-workspace";

export default function RolesPage() {
  return (
    <RolesPermissionsWorkspace permissions={adminFoundationSession.permissions} />
  );
}
