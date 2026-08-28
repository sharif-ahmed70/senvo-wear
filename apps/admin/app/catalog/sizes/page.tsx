import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default async function SizesPage() {
  const session = await getAdminSession();
  return <CatalogWorkspace kind="sizes" permissions={session?.permissions ?? []} />;
}
