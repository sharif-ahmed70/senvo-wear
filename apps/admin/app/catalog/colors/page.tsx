import { adminFoundationSession } from "../../_lib/admin-access";
import { CatalogWorkspace } from "../_components/catalog-workspace";

export default function ColorsPage() {
  return (
    <CatalogWorkspace
      kind="colors"
      permissions={adminFoundationSession.permissions}
    />
  );
}
