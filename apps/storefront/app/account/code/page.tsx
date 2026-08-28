import { Suspense } from "react";
import { OtpWorkspace } from "../../_components/otp-workspace";

export default function CodeLoginPage() {
  return (
    <Suspense fallback={<main className="premium-state-page">Loading...</main>}>
      <OtpWorkspace />
    </Suspense>
  );
}
