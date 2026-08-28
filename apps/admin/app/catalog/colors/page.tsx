import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default async function ColorsPage() {
  const session = await getAdminSession();
  return <CatalogWorkspace kind="colors" permissions={session?.permissions ?? []} />;
}
