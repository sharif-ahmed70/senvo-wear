import { getAdminSession } from "../_lib/workforce-auth-server";
import { RolesPermissionsWorkspace } from "./_components/roles-permissions-workspace";

export default async function RolesPage() {
  const session = await getAdminSession();
  return <RolesPermissionsWorkspace permissions={session?.permissions ?? []} />;
}
