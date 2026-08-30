import type { Metadata } from "next";
import { AdminLoginForm } from "./_components/admin-login-form";

export const metadata: Metadata = {
  title: "Sign in — SENVO Wear Admin",
};

export default function LoginPage() {
  return <AdminLoginForm />;
}
