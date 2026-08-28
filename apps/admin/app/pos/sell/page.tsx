import { getAdminSession } from "../../_lib/workforce-auth-server";
import { PosSaleWorkspace } from "./_components/pos-sale-workspace";
import "./pos-sale-approved.css";
import "./pos-sale-success-approved.css";

export default async function PosSellPage() {
  const session = await getAdminSession();
  return <PosSaleWorkspace permissions={session?.permissions ?? []} />;
}
