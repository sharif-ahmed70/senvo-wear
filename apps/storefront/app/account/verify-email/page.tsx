import { Suspense } from "react";
import { VerifyEmailWorkspace } from "../../_components/recovery-workspaces";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<main className="premium-state-page">Verifying...</main>}
    >
      <VerifyEmailWorkspace />
    </Suspense>
  );
}
