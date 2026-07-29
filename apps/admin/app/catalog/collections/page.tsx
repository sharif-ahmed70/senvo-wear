import { adminFoundationSession } from "../../_lib/admin-access";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default function CollectionsPage() {
  return (
    <CatalogWorkspace
      kind="collections"
      permissions={adminFoundationSession.permissions}
    />
  );
}
