import { adminFoundationSession } from "../_lib/admin-access";
import { OrganizationWorkspace } from "../organization/_components/organization-workspace";

export default function RolesPage() {
  return (
    <OrganizationWorkspace
      permissions={adminFoundationSession.permissions}
      view="roles"
    />
  );
}
