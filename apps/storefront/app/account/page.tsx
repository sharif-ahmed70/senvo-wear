import type { Metadata } from "next";
import { AccountWorkspace } from "../_components/account-workspace";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return <AccountWorkspace />;
}
