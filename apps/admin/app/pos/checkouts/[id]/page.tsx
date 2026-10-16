import { CheckoutPaymentWorkspace } from "./checkout-payment-workspace";
import { CheckoutReturnWorkspace } from "./checkout-return-workspace";
import { CheckoutRefundWorkspace } from "./checkout-refund-workspace";

export default async function CheckoutPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <CheckoutPaymentWorkspace checkoutId={id} />
      <CheckoutReturnWorkspace checkoutId={id} />
      <CheckoutRefundWorkspace checkoutId={id} />
    </>
  );
}
