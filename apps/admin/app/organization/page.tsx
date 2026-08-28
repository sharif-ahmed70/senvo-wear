import { getAdminSession } from "../_lib/workforce-auth-server";
import { OrganizationProfileWorkspace } from "./_components/organization-profile-workspace";

export default async function OrganizationPage() {
  const session = await getAdminSession();
  return <OrganizationProfileWorkspace permissions={session?.permissions ?? []} />;
}
