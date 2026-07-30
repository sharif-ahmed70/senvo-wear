import { adminFoundationSession } from "../../_lib/admin-access";
import { InventoryWorkspace } from "../_components/inventory-workspace";

export default function InventoryMovementsPage() {
  return (
    <InventoryWorkspace
      permissions={adminFoundationSession.permissions}
      view="movements"
    />
  );
}
