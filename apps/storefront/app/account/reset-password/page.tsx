import { Suspense } from "react";
import { ResetPasswordWorkspace } from "../../_components/recovery-workspaces";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="premium-state-page">Loading...</main>}>
      <ResetPasswordWorkspace />
    </Suspense>
  );
}
