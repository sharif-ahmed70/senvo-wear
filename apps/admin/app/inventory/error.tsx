"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function InventoryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ alignItems: "center", background: "#fffdf9", border: "1px solid #e1d9d0", borderRadius: 12, color: "#736a63", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", minHeight: 380, padding: 28, textAlign: "center" }}>
      <AlertCircle size={28} />
      <h1 style={{ color: "#302925", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "1.35rem", fontWeight: 500, margin: "4px 0 0" }}>Inventory could not open</h1>
      <p style={{ fontSize: ".76rem", lineHeight: 1.5, margin: 0, maxWidth: 520 }}>Retry the page. SENVO will not substitute fake stock values when the inventory service is unavailable.</p>
      <button onClick={reset} style={{ alignItems: "center", background: "#74101f", border: 0, borderRadius: 8, color: "white", cursor: "pointer", display: "inline-flex", fontWeight: 700, gap: 7, marginTop: 8, minHeight: 40, padding: "0 14px" }} type="button">
        <RefreshCw size={15} /> Retry
      </button>
    </main>
  );
}
