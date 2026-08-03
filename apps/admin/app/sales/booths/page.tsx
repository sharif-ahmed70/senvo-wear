import { adminFoundationSession } from "../../_lib/admin-access";
import { SalesSourceWorkspace } from "../_components/sales-source-workspace";

export default function SalesBoothsPage() {
  return (
    <SalesSourceWorkspace
      permissions={adminFoundationSession.permissions}
      view="booths"
    />
  );
}
