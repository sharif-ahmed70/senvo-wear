import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default async function CategoriesPage() {
  const session = await getAdminSession();
  return <CatalogWorkspace kind="categories" permissions={session?.permissions ?? []} />;
}
