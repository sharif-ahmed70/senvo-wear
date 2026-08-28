import { getAdminSession } from "../../../../_lib/workforce-auth-server";
import { ReceiptPreview } from "./receipt-preview";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await getAdminSession();
  return (
    <ReceiptPreview
      checkoutId={id}
      permissions={session?.permissions ?? []}
      printOnLoad={query.print === "1"}
    />
  );
}
