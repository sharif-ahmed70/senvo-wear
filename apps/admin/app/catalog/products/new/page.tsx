import { AdminPermissionDeniedState } from "../../../_components/admin-permission-denied-state";
import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { ProductCreateWizard } from "../_components/product-create-wizard";

export default async function NewProductPage() {
  const session = await getAdminSession();
  const canCreate =
    session?.permissions.includes("CATALOG:READ") &&
    session.permissions.includes("CATALOG:CREATE");
  if (!canCreate) return <AdminPermissionDeniedState />;
  return <ProductCreateWizard />;
}
