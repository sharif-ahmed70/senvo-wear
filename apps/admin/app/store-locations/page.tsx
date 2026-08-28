import { adminFoundationSession } from "../_lib/admin-access";
import { StoreLocationsWorkspace } from "./_components/store-locations-workspace";

export default function StoreLocationsPage() {
  return (
    <StoreLocationsWorkspace permissions={adminFoundationSession.permissions} />
  );
}
