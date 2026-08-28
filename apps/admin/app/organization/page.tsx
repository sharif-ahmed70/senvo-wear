import { adminFoundationSession } from "../_lib/admin-access";
import { OrganizationProfileWorkspace } from "./_components/organization-profile-workspace";

export default function OrganizationPage() {
  return (
    <OrganizationProfileWorkspace permissions={adminFoundationSession.permissions} />
  );
}
