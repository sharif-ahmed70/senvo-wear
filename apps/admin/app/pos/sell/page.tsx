import { adminFoundationSession } from "../../_lib/admin-access";
import { PosSaleWorkspace } from "./_components/pos-sale-workspace";
import "./pos-sale-approved.css";
import "./pos-sale-success-approved.css";

export default function PosSellPage() {
  return <PosSaleWorkspace permissions={adminFoundationSession.permissions} />;
}
