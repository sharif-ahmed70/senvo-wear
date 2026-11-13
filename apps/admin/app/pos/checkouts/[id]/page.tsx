import { returnFirstFrom } from "../../_lib/exchange";
import { CheckoutPaymentWorkspace } from "./checkout-payment-workspace";
import { CheckoutReturnWorkspace } from "./checkout-return-workspace";
import { CheckoutRefundWorkspace } from "./checkout-refund-workspace";

export default async function CheckoutPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // From Return / Exchange: the return form first, so its button is in view.
  if (returnFirstFrom(await searchParams)) {
    return (
      <>
        <CheckoutReturnWorkspace checkoutId={id} />
        <CheckoutRefundWorkspace checkoutId={id} />
        <CheckoutPaymentWorkspace checkoutId={id} />
      </>
    );
  }
  return (
    <>
      <CheckoutPaymentWorkspace checkoutId={id} />
      <CheckoutReturnWorkspace checkoutId={id} />
      <CheckoutRefundWorkspace checkoutId={id} />
    </>
  );
}
