import { AdminPermissionDeniedState } from "../_components/admin-permission-denied-state";
import { getAdminSession } from "../_lib/workforce-auth-server";
import { CatalogOverview } from "./_components/catalog-overview";

export default async function CatalogPage() {
  const session = await getAdminSession();
  if (!session?.permissions.includes("CATALOG:READ")) {
    return <AdminPermissionDeniedState />;
  }
  return <CatalogOverview />;
}
