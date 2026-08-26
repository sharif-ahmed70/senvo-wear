import { adminFoundationSession } from "../../_lib/admin-access";
import { PosSaleWorkspace } from "./_components/pos-sale-workspace";
import "./pos-sale-approved.css";

export default function PosSellPage() {
  return <PosSaleWorkspace permissions={adminFoundationSession.permissions} />;
}
