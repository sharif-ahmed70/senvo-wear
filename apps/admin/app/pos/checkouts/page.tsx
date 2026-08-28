import { adminFoundationSession } from "../../_lib/admin-access";
import { CheckoutHistoryWorkspace } from "./_components/checkout-history-workspace";

export default function PosCheckoutsPage() {
  return (
    <CheckoutHistoryWorkspace permissions={adminFoundationSession.permissions} />
  );
}
