import { getAdminSession } from "../../_lib/workforce-auth-server";
import { CheckoutHistoryWorkspace } from "./_components/checkout-history-workspace";

export default async function PosCheckoutsPage() {
  const session = await getAdminSession();
  return <CheckoutHistoryWorkspace permissions={session?.permissions ?? []} />;
}
