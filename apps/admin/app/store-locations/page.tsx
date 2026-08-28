import { getAdminSession } from "../_lib/workforce-auth-server";
import { StoreLocationsWorkspace } from "./_components/store-locations-workspace";

export default async function StoreLocationsPage() {
  const session = await getAdminSession();
  return <StoreLocationsWorkspace permissions={session?.permissions ?? []} />;
}
