import type { Metadata } from "next";
import { LoginWorkspace } from "../../_components/login-workspace";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginWorkspace />;
}
