import type { Metadata } from "next";
import { RegisterWorkspace } from "../../_components/register-workspace";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return <RegisterWorkspace />;
}
