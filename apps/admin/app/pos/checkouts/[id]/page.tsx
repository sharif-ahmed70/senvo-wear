import { adminFoundationSession } from "../../../_lib/admin-access";
import { CheckoutPaymentWorkspace } from "./checkout-payment-workspace";

export default async function CheckoutPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CheckoutPaymentWorkspace
      checkoutId={id}
      permissions={adminFoundationSession.permissions}
    />
  );
}
