import { adminFoundationSession } from "../../_lib/admin-access";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default function ProductsPage() {
  return (
    <CatalogWorkspace
      kind="products"
      permissions={adminFoundationSession.permissions}
    />
  );
}
