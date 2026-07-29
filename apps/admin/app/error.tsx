"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin route failed", { digest: error.digest });
  }, [error]);

  return (
    <main className="admin-error-state">
      <section className="admin-state-panel" aria-labelledby="error-title">
        <span className="admin-state-panel__icon">
          <TriangleAlert aria-hidden="true" size={20} strokeWidth={1.8} />
        </span>
        <h1 id="error-title">This page could not be loaded</h1>
        <p>The request failed safely. Try the page again.</p>
        <button className="admin-reset-button" onClick={reset} type="button">
          <RotateCcw aria-hidden="true" size={15} strokeWidth={2} />
          Try again
        </button>
      </section>
    </main>
  );
}
