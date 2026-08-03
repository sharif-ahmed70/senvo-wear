import { adminFoundationSession } from "../_lib/admin-access";
import { OrganizationWorkspace } from "../organization/_components/organization-workspace";

export default function TeamPage() {
  return (
    <OrganizationWorkspace
      permissions={adminFoundationSession.permissions}
      view="team"
    />
  );
}
