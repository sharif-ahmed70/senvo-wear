import { adminFoundationSession } from "../../_lib/admin-access";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default function CategoriesPage() {
  return (
    <CatalogWorkspace
      kind="categories"
      permissions={adminFoundationSession.permissions}
    />
  );
}
