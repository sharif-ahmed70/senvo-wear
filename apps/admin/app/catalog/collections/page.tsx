import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default async function CollectionsPage() {
  const session = await getAdminSession();
  return <CatalogWorkspace kind="collections" permissions={session?.permissions ?? []} />;
}
