import { getAdminSession } from "../../../_lib/workforce-auth-server";
import { CheckoutPaymentWorkspace } from "./checkout-payment-workspace";
import { CheckoutReturnWorkspace } from "./checkout-return-workspace";
import { CheckoutRefundWorkspace } from "./checkout-refund-workspace";

export default async function CheckoutPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAdminSession();
  const permissions = session?.permissions ?? [];
  return (
    <>
      <CheckoutPaymentWorkspace checkoutId={id} permissions={permissions} />
      <CheckoutReturnWorkspace checkoutId={id} permissions={permissions} />
      <CheckoutRefundWorkspace checkoutId={id} permissions={permissions} />
    </>
  );
}
