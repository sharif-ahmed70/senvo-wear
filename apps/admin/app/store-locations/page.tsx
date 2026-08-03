import { adminFoundationSession } from "../_lib/admin-access";
import { OrganizationWorkspace } from "../organization/_components/organization-workspace";

export default function StoreLocationsPage() {
  return (
    <OrganizationWorkspace
      permissions={adminFoundationSession.permissions}
      view="stores"
    />
  );
}
