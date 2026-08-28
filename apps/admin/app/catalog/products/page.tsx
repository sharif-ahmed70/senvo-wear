import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default async function ProductsPage() {
  const session = await getAdminSession();
  return <CatalogWorkspace kind="products" permissions={session?.permissions ?? []} />;
}
