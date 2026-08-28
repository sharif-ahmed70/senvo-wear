import { getAdminSession } from "../../../../_lib/workforce-auth-server";
import { ReturnReceiptPreview } from "./return-receipt-preview";

export default async function ReturnReceiptPage({
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
    <ReturnReceiptPreview
      printOnLoad={query.print === "1"}
      returnId={id}
      permissions={session?.permissions ?? []}
    />
  );
}
